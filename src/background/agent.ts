import OpenAI from 'openai';
import { BROWSER_TOOLS } from './tools';
import { PLANNER_PROMPT, EXECUTOR_PROMPT } from './prompts';
import type { BackgroundToSidebar } from '../shared/messages';
import type { ToolCallLog, Plan } from '../shared/types';

const MAX_STEPS = 20;

// ── Screenshot ───────────────────────────────────────────────────────────────

async function captureScreenshot(tabId: number): Promise<string | null> {
  try {
    const tab = await chrome.tabs.get(tabId);
    return await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 35 });
  } catch {
    return null;
  }
}

// ── DOM snapshot from content script ─────────────────────────────────────────

async function sendToContent<T>(tabId: number, message: object): Promise<T> {
  return chrome.tabs.sendMessage(tabId, message) as Promise<T>;
}

async function getPageSnapshot(tabId: number): Promise<string> {
  try {
    const res = await sendToContent<{
      snapshot?: {
        url: string; title: string; content: string;
        interactiveElements: { type: string; selector: string; text?: string; placeholder?: string; href?: string; value?: string }[]
      }
    }>(tabId, { type: 'GET_PAGE_CONTENT' });

    if (!res?.snapshot) return 'Could not read page.';
    const s = res.snapshot;
    let out = `URL: ${s.url}\nTitle: ${s.title}\n\nPage text:\n${s.content}\n\nVisible interactive elements:\n`;
    s.interactiveElements.forEach(el => {
      const detail = el.text || el.placeholder || el.href || el.value || '';
      out += `  [${el.type}] ${el.selector}${detail ? ' — ' + detail : ''}\n`;
    });
    return out;
  } catch {
    return 'Could not read page (extension may not have access here).';
  }
}

// ── Navigation wait ──────────────────────────────────────────────────────────

async function waitForLoad(tabId: number, signal: AbortSignal): Promise<void> {
  await new Promise<void>(resolve => {
    const done = () => { chrome.tabs.onUpdated.removeListener(listener); resolve(); };
    const listener = (changedId: number, info: chrome.tabs.TabChangeInfo) => {
      if (changedId === tabId && info.status === 'complete') done();
    };
    chrome.tabs.onUpdated.addListener(listener);
    signal.addEventListener('abort', done, { once: true });
    setTimeout(done, 10_000);
  });
  if (!signal.aborted) await new Promise(r => setTimeout(r, 600));
}

// ── Tool executor ────────────────────────────────────────────────────────────

async function executeTool(
  tabId: number,
  name: string,
  args: Record<string, unknown>,
  signal: AbortSignal
): Promise<string> {
  switch (name) {
    case 'read_page_content':
      return getPageSnapshot(tabId);

    case 'click_element': {
      try {
        await sendToContent(tabId, { type: 'HIGHLIGHT_ELEMENT', selector: args.selector });
        const r = await sendToContent<{ success: boolean; error?: string }>(
          tabId, { type: 'CLICK_ELEMENT', selector: args.selector }
        );
        return r.success ? `Clicked: ${args.selector}` : `Click failed: ${r.error}`;
      } catch (e) { return `Error: ${String(e)}`; }
    }

    case 'type_text': {
      try {
        await sendToContent(tabId, { type: 'HIGHLIGHT_ELEMENT', selector: args.selector });
        const r = await sendToContent<{ success: boolean; error?: string }>(
          tabId, { type: 'TYPE_TEXT', selector: args.selector, text: args.text }
        );
        return r.success ? `Typed into ${args.selector}` : `Type failed: ${r.error}`;
      } catch (e) { return `Error: ${String(e)}`; }
    }

    case 'scroll_page': {
      try {
        const r = await sendToContent<{ success: boolean }>(
          tabId, { type: 'SCROLL_PAGE', direction: args.direction, amount: args.amount ?? 300 }
        );
        return r.success ? `Scrolled ${args.direction}` : 'Scroll failed';
      } catch (e) { return `Error: ${String(e)}`; }
    }

    case 'navigate_to': {
      try {
        await chrome.tabs.update(tabId, { url: args.url as string });
        await waitForLoad(tabId, signal);
        return `Navigated to: ${args.url}`;
      } catch (e) { return `Navigation error: ${String(e)}`; }
    }

    case 'extract_data': {
      try {
        await sendToContent(tabId, { type: 'HIGHLIGHT_ELEMENT', selector: args.selector });
        const r = await sendToContent<{ success: boolean; data?: string; error?: string }>(
          tabId, { type: 'EXTRACT_DATA', selector: args.selector }
        );
        return r.success ? `Extracted:\n${r.data}` : `Extract failed: ${r.error}`;
      } catch (e) { return `Error: ${String(e)}`; }
    }

    case 'wait_for_element': {
      try {
        const r = await sendToContent<{ success: boolean; error?: string }>(
          tabId, { type: 'WAIT_FOR_ELEMENT', selector: args.selector, timeout: args.timeout ?? 5000 }
        );
        return r.success ? `Element appeared: ${args.selector}` : `Timeout: ${r.error}`;
      } catch (e) { return `Error: ${String(e)}`; }
    }

    case 'press_key': {
      try {
        const r = await sendToContent<{ success: boolean }>(
          tabId, { type: 'PRESS_KEY', key: args.key }
        );
        return r.success ? `Pressed: ${args.key}` : 'Key press failed';
      } catch (e) { return `Error: ${String(e)}`; }
    }

    case 'click_at_coordinates': {
      try {
        const r = await sendToContent<{ success: boolean; error?: string }>(
          tabId, { type: 'CLICK_AT_COORDINATES', x: args.x as number, y: args.y as number }
        );
        return r.success ? `Clicked at (${args.x}, ${args.y})` : `Click failed: ${r.error}`;
      } catch (e) { return `Error: ${String(e)}`; }
    }

    default:
      return `Unknown tool: ${name}`;
  }
}

// ── Planner ──────────────────────────────────────────────────────────────────

export async function requestPlan(
  task: string,
  pageContext: { url: string; title: string },
  apiKey: string,
  model: string,
  signal: AbortSignal
): Promise<Plan> {
  const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });

  try {
    const resp = await openai.chat.completions.create(
      {
        model,
        messages: [
          { role: 'system', content: PLANNER_PROMPT },
          { role: 'user', content: JSON.stringify({ task, current_page: pageContext }) }
        ],
        max_completion_tokens: 512
      },
      { signal }
    );

    const text = resp.choices[0].message.content ?? '{}';
    const trimmed = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    const parsed = JSON.parse(trimmed);

    return {
      understanding: String(parsed.understanding ?? task),
      steps: Array.isArray(parsed.steps) ? parsed.steps.map(String) : [task],
      initialUrl: parsed.initial_url ? String(parsed.initial_url) : null
    };
  } catch {
    return { understanding: task, steps: [task], initialUrl: null };
  }
}

// ── Agent loop ───────────────────────────────────────────────────────────────

export async function runAgentLoop(
  task: string,
  plan: Plan,
  tabId: number,
  apiKey: string,
  model: string,
  send: (msg: BackgroundToSidebar) => void,
  signal: AbortSignal
): Promise<void> {
  const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });

  const planContext = plan.steps.length
    ? `\nApproved plan:\n${plan.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
    : '';

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: EXECUTOR_PROMPT },
    { role: 'user', content: `Task: ${task}${planContext}` }
  ];

  let step = 0;

  while (step < MAX_STEPS && !signal.aborted) {
    step++;
    send({ type: 'STATUS_UPDATE', isRunning: true, step, phase: 'executing' });

    let response: OpenAI.Chat.ChatCompletion;
    try {
      response = await openai.chat.completions.create(
        { model, messages, tools: BROWSER_TOOLS, tool_choice: 'auto', max_completion_tokens: 2048 },
        { signal }
      );
    } catch (err) {
      if (signal.aborted) break;
      send({ type: 'TASK_ERROR', error: err instanceof Error ? err.message : String(err) });
      return;
    }

    if (signal.aborted) break;

    const choice = response.choices[0];
    const assistantMsg = choice.message;
    messages.push(assistantMsg);

    if (assistantMsg.content) {
      send({ type: 'AGENT_MESSAGE', content: assistantMsg.content, isComplete: choice.finish_reason !== 'tool_calls' });
    }

    if (choice.finish_reason !== 'tool_calls' || !assistantMsg.tool_calls?.length) {
      send({ type: 'TASK_COMPLETE', summary: assistantMsg.content ?? 'Task complete.' });
      return;
    }

    // Execute tools — capture screenshot after read_page_content for vision
    const toolResults: OpenAI.Chat.ChatCompletionToolMessageParam[] = [];
    let screenshotDataUrl: string | null = null;

    for (const tc of assistantMsg.tool_calls) {
      if (signal.aborted) break;

      let args: Record<string, unknown> = {};
      try { args = JSON.parse(tc.function.arguments); } catch { /* empty */ }

      const log: ToolCallLog = { id: tc.id, name: tc.function.name, args, status: 'pending', timestamp: Date.now() };
      send({ type: 'TOOL_CALLED', log });

      const result = await executeTool(tabId, tc.function.name, args, signal);

      // Vision: take screenshot after every page read so the next LLM call has visual context
      if (tc.function.name === 'read_page_content' && !signal.aborted) {
        screenshotDataUrl = await captureScreenshot(tabId);
      }

      send({ type: 'TOOL_CALLED', log: { ...log, result, status: 'success' } });
      toolResults.push({ role: 'tool', tool_call_id: tc.id, content: result });
    }

    if (signal.aborted) break;

    messages.push(...toolResults);

    // Inject screenshot as a vision user message right after the tool results
    if (screenshotDataUrl) {
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: 'Current page screenshot:' },
          { type: 'image_url', image_url: { url: screenshotDataUrl, detail: 'low' } }
        ] as OpenAI.Chat.ChatCompletionContentPart[]
      });
      screenshotDataUrl = null;
    }

    await new Promise(r => setTimeout(r, 300));
  }

  if (signal.aborted) {
    send({ type: 'TASK_STOPPED' });
  } else {
    send({ type: 'TASK_ERROR', error: `Reached max steps (${MAX_STEPS}).` });
  }
}
