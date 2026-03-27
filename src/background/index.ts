import { requestPlan, runAgentLoop } from './agent';
import { runTemplate } from './template-runner';
import { TEMPLATES } from './templates';
import { runLlmTool } from './core/llm_tools';
import { recordLlmUsage } from './core/llm_usage';
import OpenAI from 'openai';
import type { BackgroundToSidebar, SidebarToBackground } from '../shared/messages';
import type { ToolResult } from '../agent';


// ── State ────────────────────────────────────────────────────────────────────

let sidebarPort: chrome.runtime.Port | null = null;
let abortController: AbortController | null = null;
let planApprovalResolver: ((approved: boolean) => void) | null = null;

const DEFAULT_MODEL = 'gpt-5.4';
let openai: OpenAI | null = null;
let openaiApiKey = '';

function getOpenAI(apiKey: string): OpenAI {
  if (!openai || openaiApiKey !== apiKey) {
    openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
    openaiApiKey = apiKey;
  }
  return openai;
}

async function sendToolTestMessage(tabId: number, tool: string, args: Record<string, unknown>): Promise<ToolResult> {
  const payload = { type: 'RUN_AGENT_TOOL' as const, tool, args };

  const isReady = async (): Promise<boolean> => {
    try {
      const response = await chrome.tabs.sendMessage(tabId, { type: 'PING' }) as { success?: boolean; ready?: boolean };
      return response?.success === true || response?.ready === true;
    } catch {
      return false;
    }
  };

  const waitReady = async (): Promise<boolean> => {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      if (await isReady()) return true;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return false;
  };

  try {
    if (!(await isReady())) {
      throw new Error('Receiving end does not exist');
    }
    return await chrome.tabs.sendMessage(tabId, payload) as ToolResult;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes('Receiving end does not exist')) throw err;

    // Content script not yet injected — find a compiled .js content script path.
    const manifest = chrome.runtime.getManifest();
    const contentScriptFile = manifest.content_scripts
      ?.flatMap((cs) => cs.js ?? [])
      .find((file) => file.endsWith('.js'));

    if (contentScriptFile) {
      await chrome.scripting.executeScript({ target: { tabId }, files: [contentScriptFile] });
      const ready = await waitReady();
      if (!ready) {
        return { success: false, error: 'Could not establish connection to page automation runtime.' };
      }
      return await chrome.tabs.sendMessage(tabId, payload) as ToolResult;
    }

    // Dev fallback: reload tab so declarative content_scripts inject automatically.
    await chrome.tabs.reload(tabId);
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }, 10_000);

      const listener = (id: number, info: chrome.tabs.TabChangeInfo) => {
        if (id === tabId && info.status === 'complete') {
          clearTimeout(timeout);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });

    return await chrome.tabs.sendMessage(tabId, payload) as ToolResult;
  }
}

async function navigateTabAndWait(tabId: number, url: string, signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve) => {
    const done = () => { chrome.tabs.onUpdated.removeListener(listener); resolve(); };
    const listener = (id: number, info: chrome.tabs.TabChangeInfo) => {
      if (id === tabId && info.status === 'complete') done();
    };
    chrome.tabs.onUpdated.addListener(listener);
    signal.addEventListener('abort', done, { once: true });
    setTimeout(done, 12_000);
    void chrome.tabs.update(tabId, { url }).catch(done);
  });
  if (!signal.aborted) await new Promise((r) => setTimeout(r, 500));
}

const RESTRICTED_URL_PREFIXES = [
  'chrome://',
  'chrome-extension://',
  'edge://',
  'about:',
  'devtools://',
  'brave://'
];

function isRestrictedUrl(url: string): boolean {
  const normalized = url.trim().toLowerCase();
  if (!normalized) return false;
  return RESTRICTED_URL_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

async function getExecutionTab(preferredTab: chrome.tabs.Tab | undefined): Promise<chrome.tabs.Tab | null> {
  if (preferredTab?.id && !isRestrictedUrl(preferredTab.url ?? '')) {
    return preferredTab;
  }

  const sameWindowTabs = preferredTab?.windowId
    ? await new Promise<chrome.tabs.Tab[]>((resolve) => chrome.tabs.query({ windowId: preferredTab.windowId }, resolve))
    : [];
  const sameWindowCandidate = sameWindowTabs.find((tab) => tab.id && !isRestrictedUrl(tab.url ?? ''));
  if (sameWindowCandidate?.id) {
    await chrome.tabs.update(sameWindowCandidate.id, { active: true }).catch(() => undefined);
    return sameWindowCandidate;
  }

  const allTabs = await new Promise<chrome.tabs.Tab[]>((resolve) => chrome.tabs.query({}, resolve));
  const fallbackCandidate = allTabs.find((tab) => tab.id && !isRestrictedUrl(tab.url ?? ''));
  if (fallbackCandidate?.id) {
    await chrome.tabs.update(fallbackCandidate.id, { active: true }).catch(() => undefined);
    return fallbackCandidate;
  }

  const created = await chrome.tabs.create({ url: 'https://www.google.com', active: true });
  return created?.id ? created : null;
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

async function captureTabScreenshot(tabId: number, quality = 55): Promise<string | null> {
  try {
    const tab = await chrome.tabs.get(tabId);
    return await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality });
  } catch {
    return null;
  }
}

async function handleGetCoordinates(params: {
  screenshotDataUrl: string;
  description: string;
}): Promise<{ success: boolean; x?: number; y?: number; error?: string }> {
  let recordedUsage = false;
  try {
    const { apiKey } = await new Promise<{ apiKey: string }>((resolve) => {
      chrome.storage.local.get(['apiKey'], (data) => {
        resolve({ apiKey: data.apiKey ?? '' });
      });
    });

    if (!apiKey) {
      return { success: false, error: 'No API key set.' };
    }

    const client = getOpenAI(apiKey);
    const prompt = `Look at this screenshot and find: ${params.description}\nReturn ONLY valid JSON: {x: number, y: number}\nIntegers only. No other text.`;
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: params.screenshotDataUrl, detail: 'low' } }
          ]
        }
      ],
      max_completion_tokens: 50,
      temperature: 0
    });
    await recordLlmUsage({
      source: 'background.get_coordinates',
      model: 'gpt-4o-mini',
      usage: response.usage,
      status: 'success'
    });
    recordedUsage = true;

    const content = response.choices[0]?.message?.content ?? '';
    const raw = content.match(/\{[^}]+\}/)?.[0] ?? content;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return { success: false, error: 'Model returned invalid JSON' };
    }

    const x = typeof parsed.x === 'number' ? parsed.x : Number(parsed.x);
    const y = typeof parsed.y === 'number' ? parsed.y : Number(parsed.y);
    const inRange = Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 10000 && y >= 0 && y <= 10000;
    if (!inRange) {
      return { success: false, error: 'Coordinates out of range' };
    }

    return { success: true, x: Math.round(x), y: Math.round(y) };
  } catch (error) {
    if (!recordedUsage) {
      await recordLlmUsage({
        source: 'background.get_coordinates',
        model: 'gpt-4o-mini',
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to get coordinates'
      });
    }
    return { success: false, error: error instanceof Error ? error.message : 'Failed to get coordinates' };
  }
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

async function startTask(task: string, signal: AbortSignal, firstMessage = false) {
  try {
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

    const executionTab = await getExecutionTab(tab);
    if (!executionTab?.id) {
      send({ type: 'TASK_ERROR', error: 'No scriptable tab found. Open any regular website tab and try again.' });
      return;
    }

    // ── Phase 1: Planning ────────────────────────────────────────────────────
    send({ type: 'STATUS_UPDATE', isRunning: true, step: 0, phase: 'planning' });

    const plan = await requestPlan(
      task,
      { url: executionTab.url ?? tab.url ?? '', title: executionTab.title ?? tab.title ?? '' },
      apiKey,
      model,
      signal,
      executionTab.id,
      undefined,
      [],
      {
        firstMessage,
        'first-message': firstMessage
      }
    );

    if (signal.aborted) return;

    send({ type: 'PLAN_READY', plan });
    send({ type: 'AGENT_EVENT', event: 'plan_generated', payload: { stepCount: plan.steps.length } });
    if (signal.aborted) return;

    // ── Phase 2: Wait for approval ───────────────────────────────────────────
    const approved = await waitForPlanApproval(signal);
    if (!approved || signal.aborted) {
      send({ type: 'TASK_STOPPED' });
      return;
    }
    send({ type: 'STATUS_UPDATE', isRunning: true, step: 0, phase: 'executing' });

    // Navigate to initial URL from plan if needed
    if (plan.initialUrl && executionTab.url !== plan.initialUrl) {
      await navigateTabAndWait(executionTab.id, plan.initialUrl, signal);
      if (signal.aborted) return;
    }

    // ── Phase 3: Execute ─────────────────────────────────────────────────────
    await runAgentLoop(task, plan, executionTab.id, apiKey, model, send, signal);
  } catch (error) {
    if (signal.aborted) {
      send({ type: 'TASK_STOPPED' });
      return;
    }
    send({ type: 'TASK_ERROR', error: error instanceof Error ? error.message : 'Task failed unexpectedly.' });
  }
}

// ── Message handler ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (message: SidebarToBackground, sender, sendResponse) => {
    switch (message.type) {

      case 'RUN_TASK': {
        abortController?.abort();
        abortController = new AbortController();
        startTask(message.task, abortController.signal, Boolean(message.firstMessage));
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
          const executionTab = await getExecutionTab(tab);
          if (!executionTab?.id) {
            send({ type: 'TASK_ERROR', error: 'No scriptable tab found. Open any regular website tab and try again.' });
            return;
          }
          const { apiKey, model } = await new Promise<{ apiKey: string; model: string }>(resolve => {
            chrome.storage.local.get(['apiKey', 'model'], data => {
              resolve({ apiKey: data.apiKey ?? '', model: data.model ?? DEFAULT_MODEL });
            });
          });
          const steps = tmpl.build({ count: message.count, keyword: message.keyword });
          await runTemplate(executionTab.id, steps, send, signal, apiKey, model, message.keyword);
        })();
        sendResponse({ ok: true });
        break;
      }

      case 'RUN_TOOL_TEST': {
        (async () => {
          const [tab] = await new Promise<chrome.tabs.Tab[]>(resolve =>
            chrome.tabs.query({ active: true, lastFocusedWindow: true }, resolve)
          );
          const executionTab = await getExecutionTab(tab);

          if (!executionTab?.id) {
            sendResponse({ ok: false, error: 'No scriptable tab found.' });
            return;
          }

          try {
            const result = await sendToolTestMessage(executionTab.id, message.tool, message.args ?? {});

            sendResponse({ ok: true, result });
          } catch (error) {
            const tabUrl = executionTab.url ?? '';
            const isRestricted = isRestrictedUrl(tabUrl);

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
        const quality = (message as { quality?: number }).quality ?? 80;
        const senderTab = sender.tab;
        if (!senderTab?.windowId) {
          sendResponse({ ok: false, error: 'No sender tab context' });
          break;
        }
        chrome.tabs.captureVisibleTab(senderTab.windowId, { format: 'jpeg', quality }, (dataUrl) => {
          if (chrome.runtime.lastError) {
            sendResponse({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          sendResponse({ ok: true, dataUrl });
        });
        return true;
      }

      case 'GET_COORDINATES': {
        (async () => {
          const req = message as { screenshotDataUrl?: string; description?: string };
          const screenshotDataUrl = typeof req.screenshotDataUrl === 'string' ? req.screenshotDataUrl : '';
          const description = typeof req.description === 'string' ? req.description : '';
          if (!screenshotDataUrl || !description) {
            sendResponse({ ok: false, error: 'Missing screenshotDataUrl or description' });
            return;
          }

          const result = await handleGetCoordinates({ screenshotDataUrl, description });
          if (!result.success) {
            sendResponse({ ok: false, error: result.error ?? 'Failed to get coordinates' });
            return;
          }
          sendResponse({ ok: true, x: result.x, y: result.y });
        })();
        return true;
      }

      case 'APPROVE_PLAN': {
        const resolver = planApprovalResolver;
        planApprovalResolver = null;
        if (resolver) {
          send({ type: 'STATUS_UPDATE', isRunning: true, step: 0, phase: 'executing' });
          resolver(true);
        }
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

      case 'GET_NEW_PLAN': {
        (async () => {
          try {
            const tabId = sender.tab?.id;
            const [activeTab] = await new Promise<chrome.tabs.Tab[]>(resolve =>
              chrome.tabs.query({ active: true, lastFocusedWindow: true }, resolve)
            );
            const targetTab = tabId
              ? await chrome.tabs.get(tabId).catch(() => activeTab)
              : activeTab;

            if (!targetTab?.id) {
              sendResponse({ ok: false, error: 'No active tab found.' });
              return;
            }

            const { apiKey, model } = await new Promise<{ apiKey: string; model: string }>(resolve => {
              chrome.storage.local.get(['apiKey', 'model'], data => {
                resolve({ apiKey: data.apiKey ?? '', model: data.model ?? DEFAULT_MODEL });
              });
            });

            if (!apiKey) {
              sendResponse({ ok: false, error: 'No API key set.' });
              return;
            }

            const signal = new AbortController().signal;
            const plan = await requestPlan(
              message.goal,
              { url: targetTab.url ?? '', title: targetTab.title ?? '' },
              apiKey,
              model,
              signal,
              targetTab.id,
              message.imageDataUrl ?? null,
              Array.isArray(message.trace) ? message.trace : [],
              {
                ...(message.context && typeof message.context === 'object' ? message.context : {}),
                completedTasks: Array.isArray(message.completed_tasks) ? message.completed_tasks : [],
                failedTasks: Array.isArray(message.failed_tasks) ? message.failed_tasks : [],
                previousUnderstanding: typeof message.understand_prev_screen === 'string' ? message.understand_prev_screen : ''
              }
            );

            sendResponse({ ok: true, plan });
          } catch (error) {
            sendResponse({ ok: false, error: error instanceof Error ? error.message : 'Failed to generate plan' });
          }
        })();
        return true;
      }

      case 'RUN_LLM_TOOL': {
        (async () => {
          try {
            const { apiKey, model } = await new Promise<{ apiKey: string; model: string }>(resolve => {
              chrome.storage.local.get(['apiKey', 'model'], data => {
                resolve({ apiKey: data.apiKey ?? '', model: data.model ?? DEFAULT_MODEL });
              });
            });
            if (!apiKey) {
              sendResponse({ ok: false, error: 'No API key set.' });
              return;
            }

            const [activeTab] = await new Promise<chrome.tabs.Tab[]>(resolve =>
              chrome.tabs.query({ active: true, lastFocusedWindow: true }, resolve)
            );
            const targetTabId = sender.tab?.id ?? activeTab?.id;
            const userImage = typeof message.args?.imageDataUrl === 'string' ? message.args.imageDataUrl : null;
            const screenshotDataUrl = message.llmTool === 'understand_screen'
              ? null
              : (userImage ?? (targetTabId ? await captureTabScreenshot(targetTabId, 55) : null));
            const enrichedArgs = { ...(message.args ?? {}) } as Record<string, unknown>;

            if (message.llmTool === 'understand_screen' && targetTabId) {
              const [
                visibleElementsResult,
                buttonsResult,
                inputsResult,
                linksResult
              ] = await Promise.all([
                sendToolTestMessage(targetTabId, 'get_visible_elements', {}),
                sendToolTestMessage(targetTabId, 'get_buttons', {}),
                sendToolTestMessage(targetTabId, 'get_inputs', {}),
                sendToolTestMessage(targetTabId, 'get_links', {})
              ]);

              const currentContext =
                enrichedArgs.context && typeof enrichedArgs.context === 'object'
                  ? enrichedArgs.context as Record<string, unknown>
                  : {};

              enrichedArgs.context = {
                ...currentContext,
                currentUrl: sender.tab?.url ?? activeTab?.url ?? currentContext.currentUrl,
                currentTitle: sender.tab?.title ?? activeTab?.title ?? currentContext.currentTitle,
                visibleElements: visibleElementsResult.success ? visibleElementsResult.data : currentContext.visibleElements,
                buttons: buttonsResult.success ? buttonsResult.data : currentContext.buttons,
                inputs: inputsResult.success ? inputsResult.data : currentContext.inputs,
                links: linksResult.success ? linksResult.data : currentContext.links
              };
            }

            const signal = new AbortController().signal;
            const result = await runLlmTool({
              llmTool: message.llmTool,
              args: enrichedArgs,
              apiKey,
              model,
              screenshotDataUrl,
              signal
            });

            sendResponse({ ok: true, result });
          } catch (error) {
            sendResponse({ ok: false, error: error instanceof Error ? error.message : 'LLM tool failed' });
          }
        })();
        return true;
      }
    }
  }
);
