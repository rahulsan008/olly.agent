import { generatePlan, runPlannedTask } from './core/agent';
import type { BackgroundToSidebar } from '../shared/messages';
import type { Plan } from '../shared/types';

const SECURITY_BLOCK_MESSAGE =
  'Security policy: I cannot access cookies/sessions or perform login/authentication steps. Please log in yourself, then ask me to continue.';

const AUTH_KEYWORDS =
  /(log[\s-]?in|sign[\s-]?in|sign[\s-]?up|signup|password|passcode|otp|2fa|verification|authenticate|authentication|credential|cookie|session|token)/i;

function hasAuthSignal(value: unknown): boolean {
  if (typeof value === 'string') return AUTH_KEYWORDS.test(value);
  if (Array.isArray(value)) return value.some((item) => hasAuthSignal(item));
  if (value && typeof value === 'object') return Object.values(value).some((v) => hasAuthSignal(v));
  return false;
}

async function sendToContent<T>(tabId: number, message: object): Promise<T> {
  return chrome.tabs.sendMessage(tabId, message) as Promise<T>;
}

async function captureScreenshot(tabId: number): Promise<string | null> {
  try {
    const tab = await chrome.tabs.get(tabId);
    return await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 45 });
  } catch {
    return null;
  }
}

async function getPageSnapshot(tabId: number): Promise<string> {
  try {
    const res = await sendToContent<{
      snapshot?: {
        url: string;
        title: string;
        content: string;
        interactiveElements: Array<{
          type: string;
          selector: string;
          text?: string;
          placeholder?: string;
          href?: string;
          value?: string;
        }>;
      };
    }>(tabId, { type: 'GET_PAGE_CONTENT' });

    if (!res?.snapshot) return 'Could not read page.';
    const s = res.snapshot;
    let out = `URL: ${s.url}\nTitle: ${s.title}\n\nPage text:\n${s.content}\n\nVisible interactive elements:\n`;
    s.interactiveElements.forEach((el) => {
      const detail = el.text || el.placeholder || el.href || el.value || '';
      out += `  [${el.type}] ${el.selector}${detail ? ' — ' + detail : ''}\n`;
    });
    return out;
  } catch {
    return 'Could not read page (extension may not have access here).';
  }
}

async function getInitialDomContext(tabId: number): Promise<Record<string, unknown>> {
  try {
    const [buttons, inputs, links, visibleElements] = await Promise.all([
      sendToContent<{ success?: boolean; data?: unknown }>(tabId, {
        type: 'RUN_AGENT_TOOL',
        tool: 'get_buttons',
        args: {}
      }),
      sendToContent<{ success?: boolean; data?: unknown }>(tabId, {
        type: 'RUN_AGENT_TOOL',
        tool: 'get_inputs',
        args: {}
      }),
      sendToContent<{ success?: boolean; data?: unknown }>(tabId, {
        type: 'RUN_AGENT_TOOL',
        tool: 'get_links',
        args: {}
      }),
      sendToContent<{ success?: boolean; data?: unknown }>(tabId, {
        type: 'RUN_AGENT_TOOL',
        tool: 'get_visible_elements',
        args: {}
      })
    ]);

    return {
      buttons: buttons?.success ? buttons.data : [],
      inputs: inputs?.success ? inputs.data : [],
      links: links?.success ? links.data : [],
      visibleElements: visibleElements?.success ? visibleElements.data : []
    };
  } catch {
    return {};
  }
}

export async function requestPlan(
  task: string,
  pageContext: { url: string; title: string },
  apiKey: string,
  model: string,
  signal: AbortSignal,
  tabId?: number,
  imageDataUrl?: string | null,
  trace: unknown[] = [],
  extraContext: Record<string, unknown> = {}
): Promise<Plan> {
  if (hasAuthSignal(task)) {
    return { understanding: SECURITY_BLOCK_MESSAGE, steps: [SECURITY_BLOCK_MESSAGE], initialUrl: null, actions: [] };
  }

  const screenshot = imageDataUrl ?? (tabId ? await captureScreenshot(tabId) : null);
  const pageSnapshot = tabId ? await getPageSnapshot(tabId) : '';
  const isFirstMessage = extraContext.firstMessage === true || extraContext['first-message'] === true;
  const initialDomContext = tabId && isFirstMessage ? await getInitialDomContext(tabId) : {};

  return generatePlan({
    goal: task,
    trace,
    context: {
      currentPage: pageContext,
      pageSnapshot,
      ...initialDomContext,
      timestamp: Date.now(),
      ...extraContext
    },
    apiKey,
    model,
    screenshotDataUrl: screenshot,
    signal
  });
}

export async function runAgentLoop(
  task: string,
  plan: Plan,
  tabId: number,
  apiKey: string,
  model: string,
  send: (msg: BackgroundToSidebar) => void,
  signal: AbortSignal
): Promise<void> {
  if (hasAuthSignal(task) || hasAuthSignal(plan.steps) || hasAuthSignal(plan.actions ?? [])) {
    send({ type: 'TASK_ERROR', error: SECURITY_BLOCK_MESSAGE });
    return;
  }

  await runPlannedTask({
    goal: task,
    plan,
    tabId,
    apiKey,
    model,
    send,
    signal
  });
}
