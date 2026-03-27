import type { TemplateStep } from './templates';
import type { BackgroundToSidebar } from '../shared/messages';
import type { ToolCallLog } from '../shared/types';
import { recordLlmUsage } from './core/llm_usage';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function sendToContent<T>(tabId: number, message: object, timeoutMs = 10_000): Promise<T> {
  return Promise.race([
    chrome.tabs.sendMessage(tabId, message) as Promise<T>,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout sending ${(message as { type?: string }).type}`)), timeoutMs)
    )
  ]);
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

// ── AI comment generator ──────────────────────────────────────────────────────

async function generateComment(
  tabId: number,
  apiKey: string,
  model: string
): Promise<string> {
  try {
    // Grab visible text from the page to use as context
    const res = await sendToContent<{ snapshot?: { text?: string } }>(
      tabId, { type: 'GET_PAGE_CONTENT' }
    ).catch(() => null);

    const pageText = res?.snapshot?.text ?? '';

    // Extract a reasonable chunk — first 800 chars is enough for a post caption
    const context = pageText.slice(0, 800).trim() || 'a social media post';

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_completion_tokens: 60,
        messages: [
          {
            role: 'system',
            content: 'You write short, genuine, friendly Instagram comments (1–2 sentences, no hashtags, no emojis unless fitting). Reply with ONLY the comment text, nothing else.',
          },
          {
            role: 'user',
            content: `Write a comment for this post:\n\n${context}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      await recordLlmUsage({
        source: 'template_runner.generate_comment',
        model,
        status: 'error',
        error: `OpenAI error: ${response.status}`
      });
      throw new Error(`OpenAI error: ${response.status}`);
    }
    const data = await response.json() as {
      choices: { message: { content: string } }[];
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
        prompt_tokens_details?: { cached_tokens?: number };
      };
    };
    await recordLlmUsage({
      source: 'template_runner.generate_comment',
      model,
      usage: data.usage,
      status: 'success'
    });
    return data.choices[0]?.message?.content?.trim() ?? 'Great post!';
  } catch (error) {
    if (!(error instanceof Error && error.message.startsWith('OpenAI error:'))) {
      await recordLlmUsage({
        source: 'template_runner.generate_comment',
        model,
        status: 'error',
        error: error instanceof Error ? error.message : 'generateComment failed'
      });
    }
    throw error;
  }
}

// ── Step executor ─────────────────────────────────────────────────────────────

async function executeStep(
  tabId: number,
  step: TemplateStep,
  signal: AbortSignal,
  apiKey: string,
  model: string,
): Promise<string> {
  if (signal.aborted) return 'Aborted';

  switch (step.action) {
    case 'navigate':
      await chrome.tabs.update(tabId, { url: step.url });
      await waitForLoad(tabId, signal);
      return `Navigated to ${step.url}`;

    case 'highlight':
      try {
        await sendToContent(tabId, { type: 'HIGHLIGHT_ELEMENT', selector: step.selector });
      } catch { /* ignore */ }
      return `Highlighted ${step.selector}`;

    case 'click': {
      try {
        await sendToContent(tabId, { type: 'HIGHLIGHT_ELEMENT', selector: step.selector });
        const r = await sendToContent<{ success: boolean; error?: string }>(
          tabId, { type: 'CLICK_ELEMENT', selector: step.selector }
        );
        return r.success ? `Clicked: ${step.selector}` : `Click failed: ${r.error}`;
      } catch (e) { return `Error: ${String(e)}`; }
    }

    case 'type': {
      try {
        await sendToContent(tabId, { type: 'HIGHLIGHT_ELEMENT', selector: step.selector });
        const r = await sendToContent<{ success: boolean; error?: string }>(
          tabId, { type: 'TYPE_TEXT', selector: step.selector, text: step.text }
        );
        return r.success ? `Typed into ${step.selector}` : `Type failed: ${r.error}`;
      } catch (e) { return `Error: ${String(e)}`; }
    }

    case 'wait_element': {
      try {
        const r = await sendToContent<{ success: boolean; error?: string }>(
          tabId, { type: 'WAIT_FOR_ELEMENT', selector: step.selector, timeout: step.timeout ?? 5000 }
        );
        return r.success ? `Found: ${step.selector}` : `Timeout: ${r.error}`;
      } catch (e) { return `Error: ${String(e)}`; }
    }

    case 'wait_ms':
      await new Promise(r => setTimeout(r, step.ms));
      return `Waited ${step.ms}ms`;

    case 'scroll': {
      try {
        await sendToContent(tabId, { type: 'SCROLL_PAGE', direction: step.direction, amount: step.amount ?? 600 });
      } catch { /* ignore */ }
      return `Scrolled ${step.direction}`;
    }

    case 'press_key': {
      try {
        await sendToContent(tabId, { type: 'PRESS_KEY', key: step.key });
      } catch { /* ignore */ }
      return `Pressed ${step.key}`;
    }

    case 'submit_comment': {
      try {
        const r = await sendToContent<{ success: boolean; error?: string }>(
          tabId, { type: 'SUBMIT_COMMENT' }
        );
        return r.success ? 'Comment submitted' : `Submit failed: ${r.error}`;
      } catch (e) { return `Error: ${String(e)}`; }
    }

    case 'ai_comment': {
      try {
        const comment = await generateComment(tabId, apiKey, model);
        const r = await sendToContent<{ success: boolean; error?: string }>(
          tabId, { type: 'TYPE_TEXT', selector: "textarea[aria-label='Add a comment…'], textarea[placeholder='Add a comment…']", text: comment }
        );
        return r.success ? `AI comment typed: "${comment}"` : `AI type failed: ${r.error}`;
      } catch (e) { return `AI comment error: ${String(e)}`; }
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
      timestamp: Date.now()
    };
    send({ type: 'TOOL_CALLED', log });

    const result = await executeStep(tabId, step, signal, apiKey, model);

    send({ type: 'TOOL_CALLED', log: { ...log, result, status: 'success' } });
  }

  if (signal.aborted) {
    send({ type: 'TASK_STOPPED' });
  } else {
    send({ type: 'TASK_COMPLETE', summary: `Done! Executed ${steps.length} steps.` });
  }
}
