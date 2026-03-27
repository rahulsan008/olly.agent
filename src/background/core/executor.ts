import OpenAI from 'openai';
import { getCachedSelectors, recordSelectorFailure, recordSelectorSuccess } from '../../agent/core/long_term_memory';
import { AGENTIC_TOOLS_SCHEMAS } from '../../shared/agent_tools';
import type { BackgroundToSidebar } from '../../shared/messages';
import type { Plan, SubGoal, ToolCallLog } from '../../shared/types';
import { emitBridgeEvent } from './bridge';
import { recordLlmUsage } from './llm_usage';
import { decomposeTask } from './planner';
import type { AgentStep } from './types';

type Send = (msg: BackgroundToSidebar) => void;

type AgentToolResult = { success: boolean; data?: unknown; error?: string; debug?: Record<string, unknown> };

type AttemptRecord = {
  tool: string;
  args: Record<string, unknown>;
  result: string;
  success: boolean;
};

const MAX_SUBGOAL_ATTEMPTS = 20;
const DEFAULT_MODEL = 'gpt-5.4';
const NAV_TRANSITION_ERROR = 'Tool response channel closed during page transition. Retrying/replanning.';
const LOGIN_REQUIRED_MESSAGE = 'Instagram requires login here. Please log in yourself, then continue.';
const MAX_WAIT_TIMEOUT_MS = 2_000;

let openai: OpenAI | null = null;
let openaiApiKey = '';

function getOpenAI(apiKey: string): OpenAI {
  if (!openai || openaiApiKey !== apiKey) {
    openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
    openaiApiKey = apiKey;
  }
  return openai;
}

async function sendToContent<T>(tabId: number, message: object): Promise<T> {
  return chrome.tabs.sendMessage(tabId, message) as Promise<T>;
}

function isReceivingEndError(message: string): boolean {
  return message.includes('Receiving end does not exist');
}

async function waitForTabReady(tabId: number, timeoutMs = 10000): Promise<void> {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab || tab.status === 'complete') return;

  await new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    };
    const timeout = setTimeout(done, timeoutMs);
    const listener = (id: number, info: chrome.tabs.TabChangeInfo) => {
      if (id === tabId && info.status === 'complete') done();
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function getTabDebug(tabId: number): Promise<Record<string, unknown>> {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  return {
    tabId,
    tabStatus: tab?.status ?? 'unknown',
    url: tab?.url ?? '',
    title: tab?.title ?? ''
  };
}

async function injectContentScript(tabId: number): Promise<boolean> {
  const manifest = chrome.runtime.getManifest();
  const contentScriptFile = manifest.content_scripts
    ?.flatMap((cs) => cs.js ?? [])
    .find((file) => file.endsWith('.js'));

  if (!contentScriptFile) return false;

  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: [contentScriptFile] });
    return true;
  } catch {
    return false;
  }
}

async function isContentScriptReady(tabId: number): Promise<boolean> {
  try {
    const response = await sendToContent<{ success?: boolean; ready?: boolean }>(tabId, { type: 'PING' });
    return response?.success === true || response?.ready === true;
  } catch {
    return false;
  }
}

async function waitForContentScriptReady(tabId: number, attempts = 12, delayMs = 250): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await isContentScriptReady(tabId)) return true;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return false;
}

async function sendAgentTool(tabId: number, tool: string, args: Record<string, unknown>): Promise<AgentToolResult> {
  try {
    if (!(await isContentScriptReady(tabId))) {
      throw new Error('Receiving end does not exist.');
    }
    return await sendToContent(tabId, { type: 'RUN_AGENT_TOOL', tool, args });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const lower = msg.toLowerCase();
    const tabDebug = await getTabDebug(tabId);

    if (lower.includes('message channel closed') || lower.includes('port closed before a response')) {
      const url = String(tabDebug.url).toLowerCase();
      //debug
      console.debug('[executor] message channel closed', { tool, args, ...tabDebug, error: msg });
      if (/accounts\.google|signin|sign-in|login|authenticate|auth/.test(url)) {
        return {
          success: false,
          error: 'Action redirected to authentication. Please log in yourself, then continue.',
          debug: { stage: 'message_channel_closed', tool, args, ...tabDebug, rawError: msg }
        };
      }
      return {
        success: false,
        error: 'Tool response channel closed during page transition. Retrying/replanning.',
        debug: { stage: 'message_channel_closed', tool, args, ...tabDebug, rawError: msg }
      };
    }

    if (!isReceivingEndError(msg)) throw err;

    await waitForTabReady(tabId);
    const injected = await injectContentScript(tabId);
    const ready = injected ? await waitForContentScriptReady(tabId) : await waitForContentScriptReady(tabId, 4, 200);
    //debug
    console.debug('[executor] receiving end missing', { tool, args, ...tabDebug, injected, ready, error: msg });
    if (ready) {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 180 * (attempt + 1)));
        try {
          return await sendToContent(tabId, { type: 'RUN_AGENT_TOOL', tool, args });
        } catch (retryErr) {
          const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
          if (!isReceivingEndError(retryMsg)) {
            return {
              success: false,
              error: retryMsg,
              debug: { stage: 'retry_send_failed', tool, args, attempt: attempt + 1, injected, ready, ...tabDebug, rawError: retryMsg }
            };
          }
        }
      }
      return {
        success: false,
        error: 'Could not establish connection to page automation runtime.',
        debug: { stage: 'retries_exhausted', tool, args, injected, ready, retryCount: 3, ...tabDebug, rawError: msg }
      };
    }

    return {
      success: false,
      error: 'Could not inject content script into page.',
      debug: { stage: 'inject_or_ready_failed', tool, args, injected, ready, ...tabDebug, rawError: msg }
    };
  }
}

async function waitForLoad(tabId: number, signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve) => {
    const done = () => { chrome.tabs.onUpdated.removeListener(listener); resolve(); };
    const listener = (id: number, info: chrome.tabs.TabChangeInfo) => {
      if (id === tabId && info.status === 'complete') done();
    };
    chrome.tabs.onUpdated.addListener(listener);
    signal.addEventListener('abort', done, { once: true });
    setTimeout(done, 10_000);
  });
  if (!signal.aborted) await new Promise((r) => setTimeout(r, 500));
}

function asError(result: { success: boolean; error?: string }): string {
  return result.error ?? 'Tool failed';
}

function normalizeToolArgs(tool: string, args: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...args };
  if (tool === 'go_to_url' && typeof normalized.url !== 'string' && typeof normalized.query === 'string') {
    normalized.url = normalized.query;
  }
  if (tool === 'wait_for_element' || tool === 'wait_for_text') {
    const timeoutMs = typeof normalized.timeoutMs === 'number'
      ? normalized.timeoutMs
      : Number(normalized.timeoutMs);
    normalized.timeoutMs = Number.isFinite(timeoutMs)
      ? Math.max(0, Math.min(timeoutMs, MAX_WAIT_TIMEOUT_MS))
      : MAX_WAIT_TIMEOUT_MS;
  }
  return normalized;
}

async function runTool(tabId: number, tool: string, args: Record<string, unknown>, signal: AbortSignal): Promise<AgentToolResult> {
  if (signal.aborted) return { success: false, error: 'Aborted' };
  const normalizedArgs = normalizeToolArgs(tool, args);
  const result = await sendAgentTool(tabId, tool, normalizedArgs);
  const isNavigationTool = tool === 'go_to_url' || tool === 'go_back' || tool === 'refresh';
  if (!result.success && isNavigationTool && result.error === NAV_TRANSITION_ERROR) {
    await waitForLoad(tabId, signal);
    return { success: true, data: { recoveredFromTransition: true } };
  }
  if (result.success && isNavigationTool) {
    await waitForLoad(tabId, signal);
  }
  return result;
}

function extractScreenshotDataUrl(result: AgentToolResult): string | null {
  if (!result.success || !result.data || typeof result.data !== 'object') return null;
  const value = (result.data as { dataUrl?: unknown }).dataUrl;
  return typeof value === 'string' ? value : null;
}

function extractPageText(result: AgentToolResult): string {
  if (!result.success || !result.data || typeof result.data !== 'object') return '';
  const value = (result.data as { text?: unknown }).text;
  return typeof value === 'string' ? value : '';
}

function sameAction(a: AttemptRecord, b: AttemptRecord): boolean {
  return a.tool === b.tool && JSON.stringify(a.args) === JSON.stringify(b.args);
}

function repeatedFailureStreak(attemptHistory: AttemptRecord[]): boolean {
  if (attemptHistory.length < 3) return false;
  const lastThree = attemptHistory.slice(-3);
  if (lastThree.some((entry) => entry.success)) return false;
  return sameAction(lastThree[0], lastThree[1]) && sameAction(lastThree[1], lastThree[2]);
}

function isDiscoveryTool(tool: string): boolean {
  return tool === 'find'
    || tool === 'find_input'
    || tool === 'find_button'
    || tool === 'find_by_text'
    || tool === 'get_visible_elements'
    || tool === 'get_page_text';
}

function repeatedNoProgressStreak(attemptHistory: AttemptRecord[]): boolean {
  if (attemptHistory.length < 2) return false;
  const lastTwo = attemptHistory.slice(-2);
  if (lastTwo.some((entry) => !entry.success)) return false;
  if (!lastTwo.every((entry) => isDiscoveryTool(entry.tool))) return false;
  return sameAction(lastTwo[0], lastTwo[1]);
}

function extractDomainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.trim().toLowerCase();
  } catch {
    return '';
  }
}

function inferTargetUrl(text: string): string | null {
  const direct = text.match(/https?:\/\/[^\s)]+/i)?.[0];
  if (direct) return direct;
  const lower = text.toLowerCase();
  const map: Record<string, string> = {
    instagram: 'https://www.instagram.com',
    youtube: 'https://www.youtube.com',
    twitter: 'https://www.twitter.com',
    x: 'https://x.com',
    reddit: 'https://www.reddit.com',
    linkedin: 'https://www.linkedin.com',
    github: 'https://www.github.com'
  };
  for (const [key, url] of Object.entries(map)) {
    if (lower.includes(key)) return url;
  }
  return null;
}

function extractSelector(result: AgentToolResult): string | null {
  if (!result.success || !result.data || typeof result.data !== 'object') return null;
  const selector = (result.data as { selector?: unknown }).selector;
  return typeof selector === 'string' && selector.trim() ? selector.trim() : null;
}

function extractScreenUnderstanding(result: AgentToolResult): string {
  if (!result.success || !result.data || typeof result.data !== 'object') return '';
  const data = result.data as Record<string, unknown>;
  if (typeof data.summary === 'string') return data.summary;
  if (typeof data.understanding === 'string') return data.understanding;
  return '';
}

function extractPlannedAction(result: AgentToolResult): { tool: string; args: Record<string, unknown> } | null {
  if (!result.success || !result.data || typeof result.data !== 'object') return null;
  const plan = result.data as Plan;
  const first = Array.isArray(plan.actions) ? plan.actions[0] : null;
  if (!first || typeof first.tool !== 'string' || !first.args || typeof first.args !== 'object') {
    return null;
  }
  return {
    tool: first.tool,
    args: first.args
  };
}

function normalizePlannedStep(raw: unknown): AgentStep | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Record<string, unknown>;
  if (typeof candidate.tool !== 'string' || !candidate.args || typeof candidate.args !== 'object') {
    return null;
  }

  const check =
    candidate.check &&
    typeof candidate.check === 'object' &&
    typeof (candidate.check as Record<string, unknown>).tool === 'string' &&
    (candidate.check as Record<string, unknown>).args &&
    typeof (candidate.check as Record<string, unknown>).args === 'object'
      ? {
        tool: String((candidate.check as Record<string, unknown>).tool) as AgentStep['tool'],
        args: (candidate.check as Record<string, unknown>).args as Record<string, unknown>
      }
      : undefined;

  const alternates = Array.isArray(candidate.alternates)
    ? candidate.alternates
      .map((item) => normalizePlannedStep(item))
      .filter((item): item is AgentStep => Boolean(item))
      .slice(0, 3)
      .map((item) => ({
        tool: item.tool,
        args: item.args,
        why: item.why
      }))
    : undefined;

  return {
    tool: String(candidate.tool) as AgentStep['tool'],
    args: candidate.args as Record<string, unknown>,
    why: typeof candidate.why === 'string' ? candidate.why : undefined,
    check,
    alternates
  };
}

function extractPlannedActions(result: AgentToolResult): AgentStep[] {
  if (!result.success || !result.data || typeof result.data !== 'object') return [];
  const plan = result.data as Plan;
  if (!Array.isArray(plan.actions)) return [];
  return plan.actions
    .map((action) => normalizePlannedStep(action))
    .filter((action): action is AgentStep => Boolean(action))
    .slice(0, 12);
}

function lastAttemptFailed(attemptHistory: AttemptRecord[]): boolean {
  if (!attemptHistory.length) return false;
  return !attemptHistory[attemptHistory.length - 1].success;
}

function shouldRunRecoveryPlanning(attemptHistory: AttemptRecord[]): boolean {
  return lastAttemptFailed(attemptHistory) || repeatedNoProgressStreak(attemptHistory);
}

function isNavigationTool(tool: string): boolean {
  return tool === 'go_to_url' || tool === 'go_back' || tool === 'refresh';
}

type AuthState = 'login_required' | 'logged_in_or_home' | 'unknown';

function detectInstagramAuthState(currentUrl: string, pageText: string): AuthState {
  const url = currentUrl.toLowerCase();
  const text = pageText.toLowerCase();

  const loginUrl =
    url.includes('/accounts/login') ||
    url.includes('/login');
  const loginText =
    text.includes('phone number, username, or email') ||
    text.includes('log in with facebook') ||
    text.includes('forgot password') ||
    text.includes('don\'t have an account') ||
    text.includes('sign up');

  if (loginUrl || loginText) return 'login_required';

  const homeUrl = /^https:\/\/www\.instagram\.com\/?(?:[?#].*)?$/.test(currentUrl);
  const homeText =
    text.includes('for you') ||
    text.includes('following') ||
    text.includes('suggested for you') ||
    text.includes('messages') ||
    text.includes('reels') ||
    text.includes('instagram');

  if (homeUrl || homeText) return 'logged_in_or_home';
  return 'unknown';
}

function detectAuthState(currentUrl: string, pageText: string): AuthState {
  const domain = extractDomainFromUrl(currentUrl);
  if (domain.includes('instagram.com')) {
    return detectInstagramAuthState(currentUrl, pageText);
  }
  return 'unknown';
}

function isLoginLikeAction(tool: string, args: Record<string, unknown>): boolean {
  const values = [
    tool,
    ...Object.values(args).map((value) => String(value ?? ''))
  ].join(' ').toLowerCase();
  return /log[\s-]?in|sign[\s-]?in|username|password|phone number, username, or email/.test(values);
}

async function runLoggedTool(params: {
  tabId: number;
  tool: string;
  args: Record<string, unknown>;
  send: Send;
  signal: AbortSignal;
  logIdPrefix: string;
}): Promise<AgentToolResult> {
  const { tabId, tool, args, send, signal, logIdPrefix } = params;
  const log: ToolCallLog = {
    id: `${logIdPrefix}-${Date.now()}`,
    name: tool,
    args,
    status: 'pending',
    timestamp: Date.now()
  };
  send({ type: 'TOOL_CALLED', log });
  const result = await runTool(tabId, tool, args, signal);
  send({
    type: 'TOOL_CALLED',
    log: {
      ...log,
      status: result.success ? 'success' : 'error',
      result: result.success ? 'success' : asError(result),
      //debug
      debug: result.debug
    }
  });
  //debug
  console.debug('[executor] tool result', { tool, args, success: result.success, error: result.error, debug: result.debug });
  return result;
}

async function executePlannedAction(params: {
  action: AgentStep;
  index: number;
  tabId: number;
  send: Send;
  signal: AbortSignal;
}): Promise<{ success: boolean; error?: string }> {
  const { action, index, tabId, send, signal } = params;
  const attempts: AgentStep[] = [
    action,
    ...(action.alternates ?? []).map((alternate) => ({
      ...alternate,
      check: undefined,
      alternates: undefined
    }))
  ];

  for (let attemptIndex = 0; attemptIndex < attempts.length; attemptIndex += 1) {
    const candidate = attempts[attemptIndex];
    const result = await runLoggedTool({
      tabId,
      tool: candidate.tool,
      args: candidate.args,
      send,
      signal,
      logIdPrefix: `planned-step-${index + 1}-${attemptIndex + 1}`
    });

    if (!result.success) {
      if (attemptIndex === attempts.length - 1) {
        return { success: false, error: asError(result) };
      }
      continue;
    }

    if (!candidate.check) {
      return { success: true };
    }

    const checkResult = await runLoggedTool({
      tabId,
      tool: candidate.check.tool,
      args: candidate.check.args,
      send,
      signal,
      logIdPrefix: `planned-check-${index + 1}-${attemptIndex + 1}`
    });

    if (checkResult.success) {
      return { success: true };
    }

    if (attemptIndex === attempts.length - 1) {
      return { success: false, error: asError(checkResult) };
    }
  }

  return { success: false, error: 'Planned action failed' };
}

export async function isSubGoalComplete(params: {
  subGoal: SubGoal;
  pageText: string;
  apiKey: string;
  model: string;
}): Promise<boolean> {
  const { subGoal, pageText, apiKey, model } = params;
  let recordedUsage = false;
  try {
    const client = getOpenAI(apiKey);
    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: 'user',
          content: `Criteria: ${subGoal.completionCriteria}\n\nPage text: ${pageText.slice(0, 500)}\n\nMet? Reply yes or no only.`
        }
      ],
      max_completion_tokens: 10,
      temperature: 0
    });
    await recordLlmUsage({
      source: 'executor.is_subgoal_complete',
      model,
      usage: response.usage,
      status: 'success'
    });
    recordedUsage = true;

    const content = (response.choices[0]?.message?.content ?? '').toLowerCase();
    return content.includes('yes');
  } catch (error) {
    if (!recordedUsage) {
      await recordLlmUsage({
        source: 'executor.is_subgoal_complete',
        model,
        status: 'error',
        error: error instanceof Error ? error.message : 'isSubGoalComplete failed'
      });
    }
    return false;
  }
}

export async function decideNextAction(params: {
  subGoal: SubGoal;
  goalContext: string;
  currentUrl: string;
  pageText: string;
  screenshotDataUrl: string | null;
  attemptHistory: AttemptRecord[];
  cachedSelectors: string;
  authState: AuthState;
  screenUnderstanding: string;
  apiKey: string;
  model: string;
  signal: AbortSignal;
}): Promise<{ tool: string; args: Record<string, unknown> } | null> {
  const {
    subGoal,
    goalContext,
    currentUrl,
    pageText,
    screenshotDataUrl,
    attemptHistory,
    cachedSelectors,
    authState,
    screenUnderstanding,
    apiKey,
    model,
    signal
  } = params;

  let recordedUsage = false;
  try {
    const client = getOpenAI(apiKey);
    const recentAttempts = attemptHistory
      .slice(-3)
      .map((a) => `${a.tool}(${JSON.stringify(a.args)}): ${a.result}`)
      .join('\n');

    const prompt = [
      'You are a browser automation agent completing one sub-goal.',
      `Sub-goal: ${subGoal.description}`,
      `Overall task: ${goalContext}`,
      `Completion criteria: ${subGoal.completionCriteria}`,
      `Current URL: ${currentUrl}`,
      `Auth state: ${authState}`,
      `Screen understanding: ${screenUnderstanding || '(none)'}`,
      '',
      'Cached selectors for this site (use these first):',
      cachedSelectors || '(none)',
      '',
      'Recent attempts:',
      recentAttempts || '(none)',
      '',
      `Current page: ${pageText.slice(0, 400)}`,
      '',
      'Do not repeat the same successful discovery action if page state has not changed.',
      'If a find/find_input/find_button succeeded already, choose the next interaction step instead of finding it again.',
      'If auth state is logged_in_or_home or unknown, do not choose login/auth actions.',
      'Only choose login/auth actions when auth state is login_required.',
      'Choose ONE action to make progress. Prefer find before click.',
      'Use visual_click for: grid items, Nth post/video, overlapping elements, after DOM click fails.'
    ].join('\n');

    const userContent: OpenAI.Chat.ChatCompletionContentPart[] = [
      { type: 'text', text: 'Choose one tool call.' }
    ];
    if (screenshotDataUrl) {
      userContent.push({ type: 'image_url', image_url: { url: screenshotDataUrl, detail: 'low' } });
    }

    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: userContent }
      ],
      tools: [...AGENTIC_TOOLS_SCHEMAS],
      tool_choice: 'required',
      max_completion_tokens: 150,
      temperature: 0
    }, { signal });
    await recordLlmUsage({
      source: 'executor.decide_next_action',
      model,
      usage: response.usage,
      status: 'success'
    });
    recordedUsage = true;

    const toolCall = response.choices[0]?.message?.tool_calls?.[0];
    if (!toolCall) return null;

    let args: Record<string, unknown>;
    try {
      args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
    } catch {
      return null;
    }

    if (authState !== 'login_required' && isLoginLikeAction(toolCall.function.name, args)) {
      return { tool: 'understand_screen', args: {} };
    }

    return { tool: toolCall.function.name, args };
  } catch (error) {
    if (!recordedUsage) {
      await recordLlmUsage({
        source: 'executor.decide_next_action',
        model,
        status: 'error',
        error: error instanceof Error ? error.message : 'decideNextAction failed'
      });
    }
    return null;
  }
}

export async function executeSubGoal(params: {
  subGoal: SubGoal;
  goalContext: string;
  tabId: number;
  send: Send;
  signal: AbortSignal;
  apiKey: string;
  model: string;
}): Promise<{ success: boolean; error?: string }> {
  const { subGoal, goalContext, tabId, send, signal, apiKey, model } = params;
  const attemptHistory: AttemptRecord[] = [];
  const targetUrl = inferTargetUrl(goalContext);
  let forcedNextAction: { tool: string; args: Record<string, unknown> } | null = null;

  for (let attempt = 1; attempt <= MAX_SUBGOAL_ATTEMPTS; attempt += 1) {
    if (signal.aborted) return { success: false, error: 'Aborted' };

    const tab = await chrome.tabs.get(tabId).catch(() => null);
    const currentUrl = tab?.url ?? '';
    if (attempt === 1 && targetUrl) {
      const targetHost = extractDomainFromUrl(targetUrl);
      const currentHost = extractDomainFromUrl(currentUrl);
      if (targetHost && currentHost !== targetHost) {
        const navLog: ToolCallLog = {
          id: `subgoal-nav-${Date.now()}`,
          name: 'go_to_url',
          args: { url: targetUrl },
          status: 'pending',
          timestamp: Date.now()
        };
        send({ type: 'TOOL_CALLED', log: navLog });
        const navResult = await runTool(tabId, 'go_to_url', { url: targetUrl }, signal);
        send({
          type: 'TOOL_CALLED',
          log: {
            ...navLog,
            status: navResult.success ? 'success' : 'error',
            result: navResult.success ? 'success' : asError(navResult),
            //debug
            debug: navResult.debug
          }
        });
        if (!navResult.success) {
          return { success: false, error: asError(navResult) };
        }

        const navigationActions = await replanAfterNavigation({
          goal: goalContext,
          completedTasks: ['go_to_url:' + JSON.stringify({ url: targetUrl })],
          tabId,
          send,
          signal
        });
        const firstNavigationAction = navigationActions[0];
        if (firstNavigationAction && !isLoginLikeAction(firstNavigationAction.tool, firstNavigationAction.args)) {
          forcedNextAction = { tool: firstNavigationAction.tool, args: firstNavigationAction.args };
        }
      }
    }

    const screenshotResult = await sendAgentTool(tabId, 'screenshot', { quality: 55 });
    const pageTextResult = await sendAgentTool(tabId, 'get_page_text', {});
    const updatedTab = await chrome.tabs.get(tabId).catch(() => null);
    const updatedUrl = updatedTab?.url ?? currentUrl;
    const currentDomain = extractDomainFromUrl(updatedUrl);
    const screenshotDataUrl = extractScreenshotDataUrl(screenshotResult);
    const pageText = extractPageText(pageTextResult);
    const cachedSelectors = currentDomain ? await getCachedSelectors(currentDomain) : '';
    const authState = detectAuthState(updatedUrl, pageText);

    if (authState === 'login_required') {
      return { success: false, error: LOGIN_REQUIRED_MESSAGE };
    }

    const complete = await isSubGoalComplete({ subGoal, pageText, apiKey, model });
    if (complete) {
      return { success: true };
    }

    let screenUnderstanding = '';
    let replannedAction: { tool: string; args: Record<string, unknown> } | null = null;

    if (shouldRunRecoveryPlanning(attemptHistory)) {
      const understandResult = await runLoggedTool({
        tabId,
        tool: 'understand_screen',
        args: {
          goal: goalContext,
          trace: attemptHistory.slice(-5),
          context: {
            subGoal: subGoal.description,
            completionCriteria: subGoal.completionCriteria,
            currentUrl: updatedUrl,
            authState,
            previousFailure: attemptHistory.length
              ? {
                tool: attemptHistory[attemptHistory.length - 1].tool,
                args: attemptHistory[attemptHistory.length - 1].args,
                error: attemptHistory[attemptHistory.length - 1].result
              }
              : undefined
          }
        },
        send,
        signal,
        logIdPrefix: `subgoal-understand-${attempt}`
      });
      screenUnderstanding = extractScreenUnderstanding(understandResult);

      const replannedResult = await runLoggedTool({
        tabId,
        tool: 'get_new_plan',
        args: {
          query: goalContext,
          imageDataUrl: screenshotDataUrl ?? undefined,
          trace: attemptHistory.slice(-5),
          context: {
            subGoal: subGoal.description,
            completionCriteria: subGoal.completionCriteria,
            currentUrl: updatedUrl,
            pageText: pageText.slice(0, 1500),
            authState,
            summary: screenUnderstanding
          },
          completed_tasks: attemptHistory.filter((a) => a.success).map((a) => `${a.tool}:${JSON.stringify(a.args)}`),
          failed_tasks: attemptHistory.filter((a) => !a.success).map((a) => `${a.tool}:${JSON.stringify(a.args)}`),
          understand_prev_screen: screenUnderstanding
        },
        send,
        signal,
        logIdPrefix: `subgoal-replan-${attempt}`
      });

      replannedAction = extractPlannedAction(replannedResult);
    }

    let action: { tool: string; args: Record<string, unknown> } | null = null;
    if (forcedNextAction) {
      action = forcedNextAction;
    } else if (replannedAction && !isLoginLikeAction(replannedAction.tool, replannedAction.args)) {
      action = replannedAction;
    } else {
      action = await decideNextAction({
        subGoal,
        goalContext,
        currentUrl: updatedUrl,
        pageText,
        screenshotDataUrl,
        attemptHistory,
        cachedSelectors,
        authState,
        screenUnderstanding,
        apiKey,
        model,
        signal
      });
    }

    if (!action) {
      return { success: false, error: 'Failed to decide next action' };
    }

    forcedNextAction = null;

    const log: ToolCallLog = {
      id: `subgoal-${Date.now()}-${attempt}`,
      name: action.tool,
      args: action.args,
      status: 'pending',
      timestamp: Date.now()
    };
    send({ type: 'TOOL_CALLED', log });

    const result = await runTool(tabId, action.tool, action.args, signal);
    const resultText = result.success ? 'success' : asError(result);
    const query = typeof action.args.query === 'string' ? action.args.query : '';

    if (currentDomain && result.success && (action.tool === 'find' || action.tool === 'click')) {
      const selector = extractSelector(result);
      if (query && selector) {
        await recordSelectorSuccess(currentDomain, query, selector, action.tool);
      }
    }

    if (currentDomain && !result.success && query) {
      await recordSelectorFailure(currentDomain, query);
    }

    send({
      type: 'TOOL_CALLED',
      log: {
        ...log,
        status: result.success ? 'success' : 'error',
        result: resultText,
        //debug
        debug: result.debug
      }
    });

    attemptHistory.push({
      tool: action.tool,
      args: action.args,
      result: resultText,
      success: result.success
    });

    if (repeatedNoProgressStreak(attemptHistory)) {
      attemptHistory[attemptHistory.length - 1].success = false;
      attemptHistory[attemptHistory.length - 1].result = 'no progress: repeated successful discovery action';
    }

    if (!result.success && repeatedFailureStreak(attemptHistory)) {
      return { success: false, error: 'Stuck: same failed action repeated 3 times' };
    }

    if (result.success && isNavigationTool(action.tool)) {
      const navigationActions = await replanAfterNavigation({
        goal: goalContext,
        completedTasks: attemptHistory.filter((a) => a.success).map((a) => `${a.tool}:${JSON.stringify(a.args)}`),
        tabId,
        send,
        signal
      });
      const firstNavigationAction = navigationActions[0];
      if (firstNavigationAction && !isLoginLikeAction(firstNavigationAction.tool, firstNavigationAction.args)) {
        forcedNextAction = { tool: firstNavigationAction.tool, args: firstNavigationAction.args };
      }
    }
  }

  return { success: false, error: `Sub-goal not complete after ${MAX_SUBGOAL_ATTEMPTS} attempts` };
}

async function replanFromPlannedFailure(params: {
  goal: string;
  failedAction: AgentStep;
  failedError: string;
  completedActions: AgentStep[];
  tabId: number;
  send: Send;
  signal: AbortSignal;
}): Promise<AgentStep[]> {
  const { goal, failedAction, failedError, completedActions, tabId, send, signal } = params;

  const screenshotResult = await sendAgentTool(tabId, 'screenshot', { quality: 55 });
  const pageTextResult = await sendAgentTool(tabId, 'get_page_text', {});
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  const currentUrl = tab?.url ?? '';
  const screenshotDataUrl = extractScreenshotDataUrl(screenshotResult);
  const pageText = extractPageText(pageTextResult);
  const authState = detectAuthState(currentUrl, pageText);

  const trace = [
    ...completedActions.map((action) => ({
      tool: action.tool,
      args: action.args,
      result: 'success',
      success: true
    })),
    {
      tool: failedAction.tool,
      args: failedAction.args,
      result: failedError,
      success: false
    }
  ];

  const understandResult = await runLoggedTool({
    tabId,
    tool: 'understand_screen',
    args: {
      goal,
      trace: trace.slice(-5),
      context: {
        currentUrl,
        authState,
        failedStep: `${failedAction.tool}:${JSON.stringify(failedAction.args)}`,
        failedReason: failedError,
        previousFailure: {
          tool: failedAction.tool,
          args: failedAction.args,
          error: failedError
        }
      }
    },
    send,
    signal,
    logIdPrefix: 'planned-recover-understand'
  });

  const screenUnderstanding = extractScreenUnderstanding(understandResult);

  const replannedResult = await runLoggedTool({
    tabId,
    tool: 'get_new_plan',
    args: {
      query: goal,
      imageDataUrl: screenshotDataUrl ?? undefined,
      trace: trace.slice(-5),
      context: {
        currentUrl,
        pageText: pageText.slice(0, 1500),
        authState,
        summary: screenUnderstanding,
        failedStep: `${failedAction.tool}:${JSON.stringify(failedAction.args)}`,
        failedReason: failedError
      },
      completed_tasks: completedActions.map((action) => `${action.tool}:${JSON.stringify(action.args)}`),
      failed_tasks: [`${failedAction.tool}:${JSON.stringify(failedAction.args)} -> ${failedError}`],
      understand_prev_screen: screenUnderstanding
    },
    send,
    signal,
    logIdPrefix: 'planned-recover-replan'
  });

  return extractPlannedActions(replannedResult);
}

async function replanAfterNavigation(params: {
  goal: string;
  completedTasks: string[];
  tabId: number;
  send: Send;
  signal: AbortSignal;
}): Promise<AgentStep[]> {
  const { goal, completedTasks, tabId, send, signal } = params;
  const pageTextResult = await sendAgentTool(tabId, 'get_page_text', {});
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  const currentUrl = tab?.url ?? '';
  const pageText = extractPageText(pageTextResult);
  const authState = detectAuthState(currentUrl, pageText);

  const understandResult = await runLoggedTool({
    tabId,
    tool: 'understand_screen',
    args: {
      goal,
      trace: [],
      context: {
        currentUrl,
        authState,
        navigationJustHappened: true
      }
    },
    send,
    signal,
    logIdPrefix: 'nav-understand'
  });

  const screenUnderstanding = extractScreenUnderstanding(understandResult);

  const replannedResult = await runLoggedTool({
    tabId,
    tool: 'get_new_plan',
    args: {
      query: goal,
      trace: [],
      context: {
        currentUrl,
        pageText: pageText.slice(0, 1500),
        authState,
        summary: screenUnderstanding,
        navigationJustHappened: true
      },
      completed_tasks: completedTasks,
      failed_tasks: [],
      understand_prev_screen: screenUnderstanding
    },
    send,
    signal,
    logIdPrefix: 'nav-replan'
  });

  return extractPlannedActions(replannedResult);
}

export async function executePlan(params: {
  goal: string;
  actions: AgentStep[];
  tabId: number;
  send: Send;
  signal: AbortSignal;
  apiKey?: string;
  model?: string;
}): Promise<void> {
  const { goal, tabId, send, signal, actions } = params;

  let apiKey = params.apiKey ?? '';
  let model = params.model ?? '';

  if (!apiKey || !model) {
    const stored = await new Promise<{ apiKey: string; model: string }>((resolve) => {
      chrome.storage.local.get(['apiKey', 'model'], (data) => {
        resolve({ apiKey: data.apiKey ?? '', model: data.model ?? DEFAULT_MODEL });
      });
    });
    if (!apiKey) apiKey = stored.apiKey;
    if (!model) model = stored.model;
  }

  if (!apiKey) {
    send({ type: 'TASK_ERROR', error: 'No API key set. Open settings to add your OpenAI key.' });
    return;
  }

  await sendAgentTool(tabId, 'start_trace', { goal });

  if (actions.length) {
    const plannedActions = [...actions];
    const completedActions: AgentStep[] = [];

    for (let index = 0; index < plannedActions.length;) {
      if (signal.aborted) {
        send({ type: 'TASK_STOPPED' });
        return;
      }

      const action = plannedActions[index];
      send({ type: 'STATUS_UPDATE', isRunning: true, step: index + 1, phase: 'executing' });
      emitBridgeEvent(send, 'step_started', { index: index + 1, tool: action.tool });

      const result = await executePlannedAction({
        action,
        index,
        tabId,
        send,
        signal
      });

      if (!result.success) {
        const replannedActions = await replanFromPlannedFailure({
          goal,
          failedAction: action,
          failedError: result.error ?? 'Planned step failed',
          completedActions,
          tabId,
          send,
          signal
        });

        if (replannedActions.length) {
          plannedActions.splice(index, plannedActions.length - index, ...replannedActions);
          continue;
        }

        emitBridgeEvent(send, 'step_failed', {
          index: index + 1,
          tool: action.tool,
          error: result.error ?? 'Planned step failed'
        });
        send({ type: 'TASK_ERROR', error: `Planned step failed: ${action.tool}${result.error ? ` (${result.error})` : ''}` });
        return;
      }

      emitBridgeEvent(send, 'step_success', { index: index + 1, tool: action.tool });
      completedActions.push(action);

      if (isNavigationTool(action.tool)) {
        const navigationActions = await replanAfterNavigation({
          goal,
          completedTasks: completedActions.map((item) => `${item.tool}:${JSON.stringify(item.args)}`),
          tabId,
          send,
          signal
        });

        if (navigationActions.length) {
          plannedActions.splice(index + 1, plannedActions.length - (index + 1), ...navigationActions);
        }
      }

      index += 1;
    }

    const traceResult = await sendAgentTool(tabId, 'get_trace', {});
    emitBridgeEvent(send, 'task_complete', { steps: completedActions.length, trace: traceResult.data });
    send({ type: 'TASK_COMPLETE', summary: `Task complete. Finished ${completedActions.length} planned step(s).` });
    return;
  }

  const subGoals = await decomposeTask({ goal, apiKey, model, signal });

  for (let index = 0; index < subGoals.length; index += 1) {
    if (signal.aborted) {
      send({ type: 'TASK_STOPPED' });
      return;
    }

    const subGoal = subGoals[index];
    send({ type: 'STATUS_UPDATE', isRunning: true, step: index + 1, phase: 'executing' });
    emitBridgeEvent(send, 'step_started', { index: index + 1, subGoal: subGoal.description });

    const result = await executeSubGoal({
      subGoal,
      goalContext: goal,
      tabId,
      send,
      signal,
      apiKey,
      model
    });

    if (!result.success) {
      emitBridgeEvent(send, 'step_failed', {
        index: index + 1,
        subGoal: subGoal.description,
        error: result.error ?? 'Sub-goal failed'
      });
      send({ type: 'TASK_ERROR', error: `Sub-goal failed: ${subGoal.description}${result.error ? ` (${result.error})` : ''}` });
      return;
    }

    emitBridgeEvent(send, 'step_success', { index: index + 1, subGoal: subGoal.description });
  }

  const traceResult = await sendAgentTool(tabId, 'get_trace', {});
  emitBridgeEvent(send, 'task_complete', { subGoals: subGoals.length, trace: traceResult.data });
  send({ type: 'TASK_COMPLETE', summary: `Task complete. Finished ${subGoals.length} sub-goal(s).` });
}
