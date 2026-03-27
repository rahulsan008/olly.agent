import type { TemplateStep } from './templates';
import type { BackgroundToSidebar } from '../shared/messages';
import type { ToolCallLog } from '../shared/types';
import { hasSeenPost, markPostSeen } from './ig_post_dedup';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function ensureContentScriptReady(tabId: number): Promise<void> {
  const manifest = chrome.runtime.getManifest();
  const contentScriptFile = manifest.content_scripts
    ?.flatMap((cs) => cs.js ?? [])
    .find((file) => file.endsWith('.js'));

  if (!contentScriptFile) return;

  await chrome.scripting.executeScript({
    target: { tabId },
    files: [contentScriptFile],
  }).catch(() => null);

  await new Promise((resolve) => setTimeout(resolve, 150));
}

async function sendToContent<T>(tabId: number, message: object, timeoutMs = 10_000): Promise<T> {
  const sendOnce = () => Promise.race([
    chrome.tabs.sendMessage(tabId, message) as Promise<T>,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout: ${(message as { type?: string }).type}`)), timeoutMs)
    ),
  ]);

  try {
    return await sendOnce();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes('Receiving end does not exist')) throw err;

    await ensureContentScriptReady(tabId);
    return await sendOnce();
  }
}

/** Dispatch an agent tool (runs inside the content script via toolRegistry). */
async function runAgentTool<T = unknown>(
  tabId: number,
  tool: string,
  args: Record<string, unknown> = {}
): Promise<{ success: boolean; data?: T; error?: string }> {
  return sendToContent(tabId, { type: 'RUN_AGENT_TOOL', tool, args });
}

async function waitForLoad(tabId: number, signal: AbortSignal): Promise<void> {
  await new Promise<void>(resolve => {
    const done = () => { chrome.tabs.onUpdated.removeListener(listener); resolve(); };
    const listener = (id: number, info: chrome.tabs.TabChangeInfo) => {
      if (id === tabId && info.status === 'complete') done();
    };
    chrome.tabs.onUpdated.addListener(listener);
    signal.addEventListener('abort', done, { once: true });
    setTimeout(done, 10_000);
  });
  if (!signal.aborted) await new Promise(r => setTimeout(r, 600));
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

// ── AI comment generator ──────────────────────────────────────────────────────

type IgPostContext = {
  shortcode: string | null;
  caption: string;
  username: string;
  hashtags: string[];
  altText: string;
  articleText: string;
};

async function generateComment(
  tabId: number,
  apiKey: string,
  model: string,
  currentCtx?: IgPostContext | null
): Promise<{ comment: string; shortcode: string | null; context: IgPostContext | null }> {
  let context = '';
  let postCtx: IgPostContext | null = currentCtx ?? null;
  let shortcode: string | null = postCtx?.shortcode ?? null;

  if (!postCtx) {
    const ctxResult = await runAgentTool<IgPostContext>(tabId, 'ig_get_post_context').catch(() => null);
    if (ctxResult?.success && ctxResult.data) {
      postCtx = ctxResult.data;
      shortcode = postCtx.shortcode ?? null;
    }
  }

  if (postCtx) {
    const { caption, username, hashtags, altText } = postCtx;
    const parts: string[] = [];
    if (username)        parts.push(`Posted by @${username}`);
    if (caption)         parts.push(`Caption: ${caption}`);
    if (altText)         parts.push(`Image: ${altText}`);
    if (hashtags.length) parts.push(`Tags: ${hashtags.join(' ')}`);
    context = parts.join('\n').slice(0, 900);
  }

  if (!context) {
    const snap = await sendToContent<{ snapshot?: { text?: string } }>(
      tabId, { type: 'GET_PAGE_CONTENT' }
    ).catch(() => null);
    context = snap?.snapshot?.text?.slice(0, 800).trim() ?? '';
  }

  if (!context) context = 'an Instagram post';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      max_completion_tokens: 60,
      messages: [
        {
          role: 'system',
          content: 'You write short, genuine, friendly Instagram comments (1–2 sentences, no hashtags, no excessive emojis). Reply with ONLY the comment text, nothing else.',
        },
        { role: 'user', content: `Write a comment for this post:\n\n${context}` },
      ],
    }),
    signal: controller.signal,
  }).catch((error) => {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('OpenAI comment generation timed out');
    }
    throw error;
  }).finally(() => {
    clearTimeout(timeout);
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`OpenAI ${response.status}: ${body.slice(0, 200)}`);
  }
  const data = await response.json() as { choices: { message: { content: string } }[] };
  const comment = data.choices[0]?.message?.content?.trim() || 'Great post!';
  return { comment, shortcode, context: postCtx };
}

// ── Keyword match helper ──────────────────────────────────────────────────────

/** Returns true if any part of the post context contains the keyword. */
function postMatchesKeyword(ctx: IgPostContext, keyword: string): boolean {
  const kw = keyword.toLowerCase().trim();
  if (!kw) return false;
  const keywords = kw.split(',').map(part => part.trim()).filter(Boolean);
  if (!keywords.length) return false;
  const haystack = [
    ctx.caption,
    ctx.articleText,
    ctx.altText,
    ctx.username,
    ...ctx.hashtags,
  ].join(' ').toLowerCase();
  return keywords.some(term => haystack.includes(term));
}

function shouldCountEngagement(
  mode: 'like_and_comment' | 'like_only' | 'comment_only',
  result: { liked: boolean; commented: boolean }
): boolean {
  switch (mode) {
    case 'like_only':
      return result.liked;
    case 'comment_only':
      return result.commented;
    case 'like_and_comment':
    default:
      return result.liked && result.commented;
  }
}

async function readCurrentPostContext(tabId: number): Promise<IgPostContext | null> {
  const ctx = await runAgentTool<IgPostContext>(tabId, 'ig_get_post_context').catch(() => null);
  return ctx?.success && ctx.data ? ctx.data : null;
}

async function waitForPostContext(tabId: number, timeoutMs = 8_000): Promise<IgPostContext | null> {
  const waitResult = await runAgentTool(tabId, 'wait_for_element', {
    selector: 'article',
    timeoutMs,
  }).catch(() => null);

  if (!waitResult?.success) {
    await delay(1000);
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const ctx = await readCurrentPostContext(tabId);
    if (ctx && (ctx.shortcode || ctx.caption || ctx.articleText || ctx.altText)) {
      return ctx;
    }
    await delay(350);
  }

  return null;
}

/** Like + AI-comment on the current post (shared by both normal and keyword flows). */
async function likeAndComment(
  tabId: number,
  apiKey: string,
  model: string,
  send: (msg: BackgroundToSidebar) => void,
  stepPrefix: string,
  mode: 'like_and_comment' | 'like_only' | 'comment_only' = 'like_and_comment',
  currentCtx?: IgPostContext | null
): Promise<{ liked: boolean; commented: boolean; comment: string }> {
  let liked = false;

  // Like (skip for comment_only)
  if (mode !== 'comment_only') {
    await runAgentTool(tabId, 'ig_like_post');
    await delay(1500);
    liked = true;
  }

  // Comment (skip for like_only)
  if (mode === 'like_only') {
    return { liked, commented: false, comment: '' };
  }

  // Generate + dedup-check + comment
  const { comment, shortcode } = await generateComment(tabId, apiKey, model, currentCtx);

  if (shortcode && await hasSeenPost(shortcode)) {
    sendLog(send, `${stepPrefix}-skip`, 'dedup_skip', {}, `Skipped — already commented on ${shortcode}`);
    return { liked, commented: false, comment: '' };
  }

  const r = await runAgentTool(tabId, 'ig_comment_post', { text: comment });
  if (r.success && shortcode) await markPostSeen(shortcode);

  await delay(1000);
  // Close comment box
  await runAgentTool(tabId, 'press_key', { key: 'Escape' }).catch(() => null);
  await delay(600);

  return { liked, commented: r.success, comment: r.success ? comment : '' };
}

function sendLog(
  send: (msg: BackgroundToSidebar) => void,
  id: string,
  name: string,
  args: Record<string, unknown>,
  result: string,
) {
  const log: ToolCallLog = { id, name, args, status: 'success', result, timestamp: Date.now() };
  send({ type: 'TOOL_CALLED', log });
}

// ── Step executor ─────────────────────────────────────────────────────────────

async function executeStep(
  tabId: number,
  step: TemplateStep,
  signal: AbortSignal,
  apiKey: string,
  model: string,
  send: (msg: BackgroundToSidebar) => void,
  keyword?: string,
): Promise<string> {
  if (signal.aborted) return 'Aborted';

  switch (step.action) {

    case 'navigate':
      await chrome.tabs.update(tabId, { url: step.url });
      await waitForLoad(tabId, signal);
      return `Navigated to ${step.url}`;

    case 'highlight':
      await sendToContent(tabId, { type: 'HIGHLIGHT_ELEMENT', selector: step.selector }).catch(() => null);
      return `Highlighted ${step.selector}`;

    case 'click': {
      await sendToContent(tabId, { type: 'HIGHLIGHT_ELEMENT', selector: step.selector }).catch(() => null);
      const r = await runAgentTool(tabId, 'click', { selector: step.selector });
      return r.success ? `Clicked: ${step.selector}` : `Click failed: ${r.error}`;
    }

    case 'wait_element': {
      const r = await runAgentTool(tabId, 'wait_for_element', {
        selector: step.selector,
        timeoutMs: step.timeout ?? 5000,
      });
      return r.success ? `Found: ${step.selector}` : `Timeout: ${r.error}`;
    }

    case 'wait_ms':
      await delay(step.ms);
      return `Waited ${step.ms}ms`;

    case 'scroll': {
      const r = await runAgentTool(tabId, 'scroll', { direction: step.direction, amount: step.amount ?? 600 });
      return r.success ? `Scrolled ${step.direction}` : `Scroll failed: ${r.error}`;
    }

    case 'press_key': {
      const r = await runAgentTool(tabId, 'press_key', { key: step.key });
      return r.success ? `Pressed ${step.key}` : `Key failed: ${r.error}`;
    }

    case 'run_tool': {
      // Keyword filter: skip ig_like_post if post doesn't match
      if (step.tool === 'ig_like_post' && keyword?.trim()) {
        const ctx = await runAgentTool<IgPostContext>(tabId, 'ig_get_post_context').catch(() => null);
        if (ctx?.success && ctx.data && !postMatchesKeyword(ctx.data, keyword)) {
          return `Skipped like — post does not match keyword "${keyword}"`;
        }
      }
      const r = await runAgentTool(tabId, step.tool, step.args ?? {});
      return r.success
        ? `Tool "${step.tool}" succeeded${r.data ? ': ' + JSON.stringify(r.data) : ''}`
        : `Tool "${step.tool}" failed: ${r.error}`;
    }

    case 'ai_comment': {
      try {
        const { comment, shortcode, context: postCtx } = await generateComment(tabId, apiKey, model);

        // Keyword filter: if keyword set, skip posts that don't match
        if (keyword?.trim() && postCtx && !postMatchesKeyword(postCtx, keyword)) {
          return `Skipped — post does not match keyword "${keyword}"`;
        }

        if (shortcode && await hasSeenPost(shortcode)) {
          return `Skipped — already commented on post ${shortcode}`;
        }
        const r = await runAgentTool(tabId, 'ig_comment_post', { text: comment });
        if (!r.success) return `AI comment failed: ${r.error}`;
        if (shortcode) await markPostSeen(shortcode);
        return `AI comment posted: "${comment}"`;
      } catch (e) {
        return `AI comment error: ${String(e)}`;
      }
    }

    // ── Keyword scan ────────────────────────────────────────────────────────
    case 'keyword_scan': {
      const keyword = step.keyword.trim();
      if (!keyword) return 'No keyword provided — skipping scan';

      const maxPosts  = step.maxPosts ?? 10;
      const target    = step.count ?? 1;
      const mode      = step.mode ?? 'like_and_comment';
      let   matched   = 0;
      let   scanned   = 0;
      const seenThisRun = new Set<string>();

      sendLog(send, 'kw-start', 'keyword_scan', { keyword, maxPosts, target, mode },
        `Scanning up to ${maxPosts} feed posts for keyword: "${keyword}"`);

      // ── Phase 1: scan home feed ──────────────────────────────────────────
      for (let i = 0; i < maxPosts && matched < target; i++) {
        if (signal.aborted) break;
        scanned++;

        const ctx = await readCurrentPostContext(tabId);

        if (ctx) {
          const postId = ctx.shortcode ?? `post-${i}`;
          if (ctx.shortcode && seenThisRun.has(ctx.shortcode)) {
            sendLog(send, `kw-check-${i}`, 'keyword_check',
              { post: postId, keyword },
              `↻ Already evaluated post ${postId} in this run — skipping duplicate`
            );
          } else {
            if (ctx.shortcode) seenThisRun.add(ctx.shortcode);
            const matches = postMatchesKeyword(ctx, keyword);
            sendLog(send, `kw-check-${i}`, 'keyword_check',
              { post: postId, keyword },
              matches
                ? `✓ Matched "${keyword}" in post ${postId}`
                : `✗ No match in post ${postId}`
            );

            if (matches) {
              try {
                const result = await likeAndComment(tabId, apiKey, model, send, `kw-action-${i}`, mode, ctx);
                const counted = shouldCountEngagement(mode, result);
                if (counted) matched++;
                sendLog(send, `kw-action-${i}`, 'keyword_engage',
                  { keyword, post: ctx.shortcode, counted },
                  counted
                    ? `${result.liked ? '❤️ Liked' : ''}${result.commented ? ` + 💬 "${result.comment}"` : ''}`
                    : `${result.liked ? '❤️ Liked' : 'No action'}${result.commented ? ` + 💬 "${result.comment}"` : ' (not counted)'}`
                );
              } catch (error) {
                sendLog(send, `kw-action-${i}`, 'keyword_engage',
                  { keyword, post: ctx.shortcode },
                  `Engagement failed: ${error instanceof Error ? error.message : String(error)}`
                );
              }
            }
          }
        } else {
          sendLog(send, `kw-check-${i}`, 'keyword_check', {}, 'Could not read post context — skipping');
        }

        if (matched < target && i < maxPosts - 1) {
          await runAgentTool(tabId, 'scroll', { direction: 'down', amount: 900 });
          await delay(1200);
        }
      }

      if (matched >= target) {
        return `Keyword scan complete — found and engaged ${matched} / ${target} posts matching "${keyword}"`;
      }

      // ── Phase 2: fallback — Explore / hashtag search ─────────────────────
      sendLog(send, 'kw-fallback', 'keyword_fallback', { keyword },
        `Only ${matched}/${target} matches in feed — falling back to hashtag search for "${keyword}"`);

      // Navigate to hashtag page (grid view)
      const hashTag = keyword.replace(/^#+/, '').replace(/\s+/g, '');
      const fallbackUrl = `https://www.instagram.com/explore/tags/${encodeURIComponent(hashTag)}/`;
      await chrome.tabs.update(tabId, { url: fallbackUrl });
      await waitForLoad(tabId, signal);
      await delay(2000); // let grid render

        const gridResult = await runAgentTool<Array<{ index: number; href: string; shortcode: string | null; kind: string }>>(
          tabId,
          'ig_get_grid_posts',
          { limit: Math.max(target * 4, 12) }
        ).catch(() => null);

        const fallbackPosts = gridResult?.success && Array.isArray(gridResult.data) ? gridResult.data : [];
        if (!fallbackPosts.length) {
          sendLog(send, 'kw-fb-err', 'keyword_fallback', { keyword },
            'Could not find any grid posts on the hashtag page');
        } else {
          sendLog(send, 'kw-fb-found', 'keyword_fallback', { keyword, candidates: fallbackPosts.length },
            `Found ${fallbackPosts.length} candidate hashtag posts`
          );

          for (let i = 0; i < fallbackPosts.length && matched < target; i++) {
            if (signal.aborted) break;

            if ((await chrome.tabs.get(tabId)).url !== fallbackUrl) {
              await chrome.tabs.update(tabId, { url: fallbackUrl });
              await waitForLoad(tabId, signal);
              await delay(1200);
            }

            const openResult = await runAgentTool(tabId, 'ig_open_grid_post', {
              index: i,
              href: fallbackPosts[i]?.href,
            }).catch(() => null);
            if (!openResult?.success) {
              sendLog(send, `kw-fb-open-${i}`, 'keyword_check', { source: 'hashtag_search', index: i },
                `Could not open hashtag grid post ${i + 1}`
              );
              continue;
            }

            const ctx = await waitForPostContext(tabId);
            if (ctx) {
              const postId = ctx.shortcode ?? `fallback-${i}`;
              if (ctx.shortcode && seenThisRun.has(ctx.shortcode)) {
                sendLog(send, `kw-fb-check-${i}`, 'keyword_check',
                  { source: 'hashtag_search', post: postId, keyword },
                  `↻ Already evaluated post ${postId} in this run — moving on`
                );
                await runAgentTool(tabId, 'ig_close_post_view').catch(() => null);
                await delay(900);
                continue;
              }

              if (ctx.shortcode) seenThisRun.add(ctx.shortcode);
              sendLog(send, `kw-fb-check-${i}`, 'keyword_check',
                { source: 'hashtag_search', post: postId, keyword, href: fallbackPosts[i]?.href },
                `✓ Matched "${keyword}" via hashtag search in post ${postId}`
              );

              try {
                const result = await likeAndComment(tabId, apiKey, model, send, `kw-fb-${i}`, mode, ctx);
                const counted = shouldCountEngagement(mode, result);
                if (counted) matched++;
                sendLog(send, `kw-fb-${i}`, 'keyword_engage',
                  { source: 'hashtag_search', post: ctx.shortcode, counted, href: fallbackPosts[i]?.href },
                  counted
                    ? `${result.liked ? '❤️ Liked' : ''}${result.commented ? ` + 💬 "${result.comment}"` : ''}`
                    : `${result.liked ? '❤️ Liked' : 'No action'}${result.commented ? ` + 💬 "${result.comment}"` : ' (not counted)'}`
                );
              } catch (error) {
                sendLog(send, `kw-fb-${i}`, 'keyword_engage',
                  { source: 'hashtag_search', post: ctx.shortcode, href: fallbackPosts[i]?.href },
                  `Engagement failed: ${error instanceof Error ? error.message : String(error)}`
                );
              }
            } else {
              sendLog(send, `kw-fb-${i}`, 'keyword_check', { source: 'hashtag_search', href: fallbackPosts[i]?.href },
                'Could not read hashtag post context — skipping'
              );
            }

            await runAgentTool(tabId, 'ig_close_post_view').catch(() => null);
            await delay(900);
          }
        }

      return `Keyword scan done — ${matched}/${target} posts engaged for "${keyword}" (${scanned} feed posts scanned, hashtag fallback used)`;
    }

    default:
      return 'Unknown step';
  }
}

// ── Main runner ───────────────────────────────────────────────────────────────

export async function runTemplate(
  tabId: number,
  steps: TemplateStep[],
  send: (msg: BackgroundToSidebar) => void,
  signal: AbortSignal,
  apiKey = '',
  model = 'gpt-4o-mini',
  keyword?: string,
): Promise<void> {
  for (let i = 0; i < steps.length; i++) {
    if (signal.aborted) break;

    const step = steps[i];
    send({ type: 'STATUS_UPDATE', isRunning: true, step: i + 1, phase: 'executing' });

    const log: ToolCallLog = {
      id: `tmpl-${i}`,
      name: step.action,
      args: step as unknown as Record<string, unknown>,
      status: 'pending',
      timestamp: Date.now(),
    };
    send({ type: 'TOOL_CALLED', log });

    const result = await executeStep(tabId, step, signal, apiKey, model, send, keyword);

    send({ type: 'TOOL_CALLED', log: { ...log, result, status: 'success' } });
  }

  if (signal.aborted) {
    send({ type: 'TASK_STOPPED' });
  } else {
    send({ type: 'TASK_COMPLETE', summary: `Done! Executed ${steps.length} steps.` });
  }
}
