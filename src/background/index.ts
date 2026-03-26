import { requestPlan, runAgentLoop } from './agent';
import { runTemplate } from './template-runner';
import { TEMPLATES } from './templates';
import type { BackgroundToSidebar, SidebarToBackground } from '../shared/messages';
import type { ToolResult } from '../agent';


// ── State ────────────────────────────────────────────────────────────────────

let sidebarPort: chrome.runtime.Port | null = null;
let abortController: AbortController | null = null;
let planApprovalResolver: ((approved: boolean) => void) | null = null;

const DEFAULT_MODEL = 'gpt-5.1';

async function sendToolTestMessage(tabId: number, tool: string, args: Record<string, unknown>): Promise<ToolResult> {
  const payload = { type: 'RUN_AGENT_TOOL' as const, tool, args };

  try {
    return await chrome.tabs.sendMessage(tabId, payload) as ToolResult;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes('Receiving end does not exist')) throw err;

    // Content script not yet injected — find the compiled path from the built manifest
    const manifest = chrome.runtime.getManifest();
    const contentScriptFile = manifest.content_scripts?.[0]?.js?.[0];
    if (!contentScriptFile) throw new Error('Content script path not found in manifest');

    await chrome.scripting.executeScript({ target: { tabId }, files: [contentScriptFile] });
    await new Promise(r => setTimeout(r, 150));

    return await chrome.tabs.sendMessage(tabId, payload) as ToolResult;
  }
}

// ── Side panel ───────────────────────────────────────────────────────────────

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// ── Port connection ──────────────────────────────────────────────────────────

chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'sidebar') return;
  sidebarPort = port;
  port.onDisconnect.addListener(() => { sidebarPort = null; });
});

function send(msg: BackgroundToSidebar) {
  sidebarPort?.postMessage(msg);
}

// ── Plan approval helper ─────────────────────────────────────────────────────

function waitForPlanApproval(signal: AbortSignal): Promise<boolean> {
  return new Promise(resolve => {
    if (signal.aborted) { resolve(false); return; }
    planApprovalResolver = resolve;
    signal.addEventListener('abort', () => {
      planApprovalResolver = null;
      resolve(false);
    }, { once: true });
  });
}

// ── Main task runner ─────────────────────────────────────────────────────────

async function startTask(task: string, signal: AbortSignal) {
  const { apiKey, model } = await new Promise<{ apiKey: string; model: string }>(resolve => {
    chrome.storage.local.get(['apiKey', 'model'], data => {
      resolve({ apiKey: data.apiKey ?? '', model: data.model ?? DEFAULT_MODEL });
    });
  });

  if (!apiKey) {
    send({ type: 'TASK_ERROR', error: 'No API key set. Open settings to add your OpenAI key.' });
    return;
  }

  const [tab] = await new Promise<chrome.tabs.Tab[]>(resolve => {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, resolve);
  });

  if (!tab?.id) {
    send({ type: 'TASK_ERROR', error: 'No active tab found.' });
    return;
  }

  // ── Phase 1: Planning ────────────────────────────────────────────────────
  send({ type: 'STATUS_UPDATE', isRunning: true, step: 0, phase: 'planning' });

  const plan = await requestPlan(
    task,
    { url: tab.url ?? '', title: tab.title ?? '' },
    apiKey, model, signal
  );

  if (signal.aborted) return;

  send({ type: 'PLAN_READY', plan });

  // ── Phase 2: Wait for approval ───────────────────────────────────────────
  const approved = await waitForPlanApproval(signal);
  if (!approved || signal.aborted) {
    send({ type: 'TASK_STOPPED' });
    return;
  }

  // Navigate to initial URL from plan if needed
  if (plan.initialUrl && tab.url !== plan.initialUrl) {
    await chrome.tabs.update(tab.id, { url: plan.initialUrl });
    await new Promise<void>(resolve => {
      const listener = (id: number, info: chrome.tabs.TabChangeInfo) => {
        if (id === tab.id && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
      signal.addEventListener('abort', () => { chrome.tabs.onUpdated.removeListener(listener); resolve(); }, { once: true });
      setTimeout(resolve, 10_000);
    });
    if (signal.aborted) return;
    await new Promise(r => setTimeout(r, 600));
  }

  // ── Phase 3: Execute ─────────────────────────────────────────────────────
  await runAgentLoop(task, plan, tab.id, apiKey, model, send, signal);
}

// ── Message handler ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (message: SidebarToBackground, _sender, sendResponse) => {
    switch (message.type) {

      case 'RUN_TASK': {
        abortController?.abort();
        abortController = new AbortController();
        startTask(message.task, abortController.signal);
        sendResponse({ ok: true });
        break;
      }

      case 'RUN_TEMPLATE': {
        abortController?.abort();
        abortController = new AbortController();
        const signal = abortController.signal;
        (async () => {
          const tmpl = TEMPLATES[message.platform]?.[message.action];
          if (!tmpl) {
            send({ type: 'TASK_ERROR', error: `Unknown template: ${message.platform}/${message.action}` });
            return;
          }
          const [tab] = await new Promise<chrome.tabs.Tab[]>(resolve =>
            chrome.tabs.query({ active: true, lastFocusedWindow: true }, resolve)
          );
          if (!tab?.id) {
            send({ type: 'TASK_ERROR', error: 'No active tab found.' });
            return;
          }
          const { apiKey, model } = await new Promise<{ apiKey: string; model: string }>(resolve => {
            chrome.storage.local.get(['apiKey', 'model'], data => {
              resolve({ apiKey: data.apiKey ?? '', model: data.model ?? DEFAULT_MODEL });
            });
          });
          const steps = tmpl.build({ count: message.count, commentText: message.commentText });
          await runTemplate(tab.id, steps, send, signal, apiKey, model);
        })();
        sendResponse({ ok: true });
        break;
      }

      case 'RUN_TOOL_TEST': {
        (async () => {
          const [tab] = await new Promise<chrome.tabs.Tab[]>(resolve =>
            chrome.tabs.query({ active: true, lastFocusedWindow: true }, resolve)
          );

          if (!tab?.id) {
            sendResponse({ ok: false, error: 'No active tab found.' });
            return;
          }

          try {
            const result = await sendToolTestMessage(tab.id, message.tool, message.args ?? {});

            sendResponse({ ok: true, result });
          } catch (error) {
            const tabUrl = tab.url ?? '';
            const isRestricted = tabUrl.startsWith('chrome://') || tabUrl.startsWith('chrome-extension://') || tabUrl.startsWith('edge://');

            sendResponse({
              ok: false,
              error: isRestricted
                ? `Tool execution is not allowed on this page: ${tabUrl}`
                : (error instanceof Error ? error.message : 'Tool execution failed')
            });
          }
        })();
        return true;
      }

      case 'CAPTURE_SCREENSHOT': {
        chrome.tabs.query({ active: true, lastFocusedWindow: true }, ([tab]) => {
          if (!tab?.id) { sendResponse({ ok: false, error: 'No active tab' }); return; }
          const quality = (message as { quality?: number }).quality ?? 80;
          chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality }, dataUrl => {
            if (chrome.runtime.lastError) {
              sendResponse({ ok: false, error: chrome.runtime.lastError.message });
            } else {
              sendResponse({ ok: true, dataUrl });
            }
          });
        });
        return true;
      }

      case 'APPROVE_PLAN': {
        planApprovalResolver?.(true);
        planApprovalResolver = null;
        sendResponse({ ok: true });
        break;
      }

      case 'CANCEL_PLAN': {
        planApprovalResolver?.(false);
        planApprovalResolver = null;
        sendResponse({ ok: true });
        break;
      }

      case 'STOP_TASK': {
        abortController?.abort();
        abortController = null;
        planApprovalResolver?.(false);
        planApprovalResolver = null;
        send({ type: 'TASK_STOPPED' });
        sendResponse({ ok: true });
        break;
      }

      case 'SAVE_API_KEY': {
        chrome.storage.local.set({ apiKey: message.apiKey }, () => sendResponse({ ok: true }));
        return true;
      }

      case 'GET_API_KEY': {
        chrome.storage.local.get(['apiKey'], ({ apiKey }) =>
          sendResponse({ apiKey: (apiKey as string) ?? null })
        );
        return true;
      }

      case 'SAVE_MODEL': {
        chrome.storage.local.set({ model: message.model }, () => sendResponse({ ok: true }));
        return true;
      }

      case 'GET_MODEL': {
        chrome.storage.local.get(['model'], ({ model }) =>
          sendResponse({ model: (model as string) ?? DEFAULT_MODEL })
        );
        return true;
      }
    }
  }
);
