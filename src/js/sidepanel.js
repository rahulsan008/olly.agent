import '../css/sidepanel.css';
import { GOAL_VERIFY_PROMPT, HIGH_LEVEL_PLANNER_PROMPT, NEXT_ACTION_PROMPT } from '../prompts';

const STORAGE_KEYS = {
  apiKey: 'openai_api_key',
  model: 'openai_model',
  messages: 'chat_messages'
};

const MODEL_DEFAULT = 'gpt-5.1';
const MAX_SAVED_MESSAGES = 30;
const MODEL_HISTORY_LIMIT = 8;
const MAX_ACTIONS_PER_PLAN = 12;
const MAX_ITERATIONS_PER_GOAL = 12;
const MAX_SCREENSHOT_BASE64_CHARS = 16000;

const elements = {
  chatHeader: document.getElementById('chatHeader'),
  keySetup: document.getElementById('keySetup'),
  chatScreen: document.getElementById('chatScreen'),
  apiKeyForm: document.getElementById('apiKeyForm'),
  apiKeyInput: document.getElementById('apiKeyInput'),
  keyError: document.getElementById('keyError'),
  changeKeyBtn: document.getElementById('changeKeyBtn'),
  newChatBtn: document.getElementById('newChatBtn'),
  modelSelect: document.getElementById('modelSelect'),
  messages: document.getElementById('messages'),
  planReview: document.getElementById('planReview'),
  planSummary: document.getElementById('planSummary'),
  planSteps: document.getElementById('planSteps'),
  planSites: document.getElementById('planSites'),
  approvePlanBtn: document.getElementById('approvePlanBtn'),
  cancelPlanBtn: document.getElementById('cancelPlanBtn'),
  chatForm: document.getElementById('chatForm'),
  promptInput: document.getElementById('promptInput'),
  stopBtn: document.getElementById('stopBtn'),
  sendBtn: document.getElementById('sendBtn'),
  chatError: document.getElementById('chatError')
};

const state = {
  apiKey: '',
  model: MODEL_DEFAULT,
  messages: [],
  pendingPlan: null,
  isPlanning: false,
  isExecuting: false,
  stopRequested: false
};

const init = async () => {
  bindEvents();
  await hydrateState();
  renderMessages();
  renderPlanReview();
  updateComposerState();

  if (state.apiKey) {
    showChat();
  } else {
    showKeySetup();
  }
};

const bindEvents = () => {
  elements.apiKeyForm.addEventListener('submit', onSaveKey);
  elements.changeKeyBtn.addEventListener('click', showKeySetup);
  elements.newChatBtn.addEventListener('click', onNewChat);
  elements.modelSelect.addEventListener('change', onModelChange);
  elements.chatForm.addEventListener('submit', onSendMessage);
  elements.stopBtn.addEventListener('click', onStopExecution);
  elements.approvePlanBtn.addEventListener('click', onApprovePlan);
  elements.cancelPlanBtn.addEventListener('click', onCancelPlan);
};

const hydrateState = async () => {
  const data = await chrome.storage.local.get(Object.values(STORAGE_KEYS));

  if (typeof data[STORAGE_KEYS.apiKey] === 'string') {
    state.apiKey = data[STORAGE_KEYS.apiKey].trim();
  }

  if (typeof data[STORAGE_KEYS.model] === 'string') {
    state.model = data[STORAGE_KEYS.model];
  }

  if (Array.isArray(data[STORAGE_KEYS.messages])) {
    state.messages = data[STORAGE_KEYS.messages].filter(isValidMessage);
  }

  if ([...elements.modelSelect.options].some((option) => option.value === state.model)) {
    elements.modelSelect.value = state.model;
  } else {
    state.model = MODEL_DEFAULT;
    elements.modelSelect.value = MODEL_DEFAULT;
  }
};

const isValidMessage = (message) => {
  return Boolean(
    message &&
      (message.role === 'user' || message.role === 'assistant') &&
      typeof message.content === 'string' &&
      message.content.trim()
  );
};

const showKeySetup = () => {
  elements.keySetup.classList.remove('hidden');
  elements.chatScreen.classList.add('hidden');
  elements.chatHeader.classList.add('hidden');
  elements.apiKeyInput.value = state.apiKey;
  elements.apiKeyInput.focus();
  hideError(elements.keyError);
};

const showChat = () => {
  elements.keySetup.classList.add('hidden');
  elements.chatScreen.classList.remove('hidden');
  elements.chatHeader.classList.remove('hidden');
  elements.promptInput.focus();
  hideError(elements.keyError);
};

const onSaveKey = async (event) => {
  event.preventDefault();
  const value = elements.apiKeyInput.value.trim();

  if (!value) {
    showError(elements.keyError, 'API key is required.');
    return;
  }

  await chrome.storage.local.set({
    [STORAGE_KEYS.apiKey]: value
  });

  state.apiKey = value;
  showChat();
};

const onModelChange = async (event) => {
  state.model = event.target.value;
  await chrome.storage.local.set({
    [STORAGE_KEYS.model]: state.model
  });
};

const onStopExecution = () => {
  if (!state.isExecuting && !state.isPlanning) {
    return;
  }

  state.stopRequested = true;
  updateComposerState();
  appendMessage('assistant', 'Stop requested. Finishing current step and halting.');
};

const onNewChat = async () => {
  state.messages = [];
  state.pendingPlan = null;
  state.stopRequested = false;
  hideError(elements.chatError);
  await persistMessages();
  renderMessages();
  renderPlanReview();
  updateComposerState();
};

const onSendMessage = async (event) => {
  event.preventDefault();

  if (state.isPlanning || state.isExecuting) {
    return;
  }

  if (!state.apiKey) {
    showKeySetup();
    return;
  }

  if (state.pendingPlan) {
    showError(elements.chatError, 'Approve or cancel the current plan first.');
    return;
  }

  const prompt = elements.promptInput.value.trim();
  if (!prompt) {
    return;
  }

  hideError(elements.chatError);
  appendMessage('user', prompt);
  elements.promptInput.value = '';

  state.stopRequested = false;
  state.isPlanning = true;
  updateComposerState();

  try {
    const observation = await collectObservation();
    const plan = await requestHighLevelPlan(prompt, observation);
    if (state.stopRequested) {
      appendMessage('assistant', 'Planning stopped by user.');
      return;
    }
    plan.originalPrompt = prompt;
    plan.contextUrl = observation.url || '';
    state.pendingPlan = plan;
    renderPlanReview();
    appendMessage('assistant', formatPlanCreatedMessage(plan));
  } catch (error) {
    showError(elements.chatError, error.message || 'Planning failed.');
  } finally {
    state.isPlanning = false;
    state.stopRequested = false;
    updateComposerState();
  }
};

const onApprovePlan = async () => {
  if (!state.pendingPlan || state.isPlanning || state.isExecuting) {
    return;
  }

  hideError(elements.chatError);
  const plan = state.pendingPlan;

  state.stopRequested = false;
  state.isExecuting = true;
  updateComposerState();

  try {
    const executionResult = await executeAdaptivePlan(plan);
    appendMessage('assistant', formatExecutionReport(plan, executionResult));
  } catch (error) {
    showError(elements.chatError, error.message || 'Execution failed.');
  } finally {
    state.pendingPlan = null;
    state.isExecuting = false;
    state.stopRequested = false;
    renderPlanReview();
    updateComposerState();
  }
};

const onCancelPlan = () => {
  if (!state.pendingPlan || state.isPlanning || state.isExecuting) {
    return;
  }

  state.pendingPlan = null;
  renderPlanReview();
  updateComposerState();
  appendMessage('assistant', 'Plan cancelled. Send a new prompt to create another plan.');
};

const requestHighLevelPlan = async (prompt, observation) => {
  const contextPayload = {
    user_prompt: prompt,
    current_tab: {
      url: observation.url,
      title: observation.title
    },
    screenshot_base64_jpeg: truncateBase64(observation.screenshotBase64),
    screenshot_base64_length: observation.screenshotBase64.length,
    screenshot_truncated: observation.screenshotBase64.length > MAX_SCREENSHOT_BASE64_CHARS,
    dom_snapshot: observation.dom
  };

  const messages = [
    { role: 'system', content: HIGH_LEVEL_PLANNER_PROMPT },
    ...buildModelMessages(),
    {
      role: 'user',
      content: JSON.stringify(contextPayload)
    }
  ];

  const content = await callOpenAIChat(messages);
  return parseHighLevelPlan(content, prompt);
};

const requestNextActionDecision = async ({ prompt, goal, goalIndex, totalGoals, history, observation }) => {
  const contextPayload = {
    original_prompt: prompt,
    current_goal: goal,
    goal_index: goalIndex + 1,
    total_goals: totalGoals,
    current_tab: {
      url: observation.url,
      title: observation.title
    },
    screenshot_base64_jpeg: truncateBase64(observation.screenshotBase64),
    screenshot_base64_length: observation.screenshotBase64.length,
    screenshot_truncated: observation.screenshotBase64.length > MAX_SCREENSHOT_BASE64_CHARS,
    dom_snapshot: observation.dom,
    recent_history: history.slice(-4)
  };

  const messages = [
    { role: 'system', content: NEXT_ACTION_PROMPT },
    {
      role: 'user',
      content: JSON.stringify(contextPayload)
    }
  ];

  const content = await callOpenAIChat(messages);
  return parseNextActionDecision(content);
};

const requestGoalVerification = async ({ prompt, goal, goalIndex, totalGoals, history, observation }) => {
  const contextPayload = {
    original_prompt: prompt,
    current_goal: goal,
    goal_index: goalIndex + 1,
    total_goals: totalGoals,
    current_tab: {
      url: observation.url,
      title: observation.title
    },
    screenshot_base64_jpeg: truncateBase64(observation.screenshotBase64),
    screenshot_base64_length: observation.screenshotBase64.length,
    screenshot_truncated: observation.screenshotBase64.length > MAX_SCREENSHOT_BASE64_CHARS,
    dom_snapshot: observation.dom,
    recent_history: history.slice(-6)
  };

  const messages = [
    { role: 'system', content: GOAL_VERIFY_PROMPT },
    {
      role: 'user',
      content: JSON.stringify(contextPayload)
    }
  ];

  const content = await callOpenAIChat(messages);
  return parseGoalVerification(content);
};

const callOpenAIChat = async (messages) => {
  const payload = {
    model: state.model,
    messages
  };

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${state.apiKey}`
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorMessage = data && data.error && data.error.message
      ? data.error.message
      : `OpenAI request failed (${response.status})`;
    throw new Error(errorMessage);
  }

  const content = extractAssistantText(data);
  if (!content) {
    throw new Error('Model response was empty.');
  }

  return content;
};

const buildModelMessages = () => {
  return state.messages.slice(-MODEL_HISTORY_LIMIT).map((message) => ({
    role: message.role,
    content: message.content
  }));
};

const parseHighLevelPlan = (rawContent, fallbackPrompt) => {
  const parsed = tryParseJson(rawContent) || buildFallbackPlan(fallbackPrompt);
  return sanitizeHighLevelPlan(parsed, fallbackPrompt);
};

const parseNextActionDecision = (rawContent) => {
  const parsed = tryParseJson(rawContent) || {};
  const goalStatusRaw = getText(parsed.goal_status || parsed.status || '', '').toLowerCase();

  const goalStatus = ['in_progress', 'done', 'blocked'].includes(goalStatusRaw)
    ? goalStatusRaw
    : 'in_progress';

  const progressNote = getText(parsed.progress_note || parsed.note || '', '');
  const nextAction = parsed.next_action ? sanitizeAction(parsed.next_action) : null;

  return {
    goalStatus,
    progressNote,
    nextAction
  };
};

const parseGoalVerification = (rawContent) => {
  const parsed = tryParseJson(rawContent) || {};
  const verifiedDone = Boolean(parsed.verified_done === true);
  const reason = getText(parsed.reason || parsed.progress_note || '', '');
  const suggestedNextAction = parsed.suggested_next_action ? sanitizeAction(parsed.suggested_next_action) : null;

  return {
    verifiedDone,
    reason,
    suggestedNextAction
  };
};

const tryParseJson = (rawContent) => {
  if (!rawContent) {
    return null;
  }

  const trimmed = rawContent.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();

  try {
    return JSON.parse(trimmed);
  } catch (error) {
    // loose extraction below
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }

  try {
    return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
  } catch (error) {
    return null;
  }
};

const buildFallbackPlan = (prompt) => {
  const inferredUrl = inferOpenUrlFromPrompt(prompt);
  if (inferredUrl) {
    return {
      stage_1_understanding: `You want to open ${inferredUrl}.`,
      stage_2_plan: ['Navigate to requested website', 'Complete requested action'],
      stage_3_actions: [{ type: 'open_url', url: inferredUrl, reason: 'Inferred from prompt' }],
      stage_4_user_message: 'Plan ready.'
    };
  }

  return {
    stage_1_understanding: 'Task received.',
    stage_2_plan: ['Analyze page state', 'Take next best action'],
    stage_3_actions: [],
    stage_4_user_message: 'Plan ready.'
  };
};

const sanitizeHighLevelPlan = (input, prompt) => {
  const stage1 = getText(input.stage_1_understanding, 'Task received.');

  const stage2 = Array.isArray(input.stage_2_plan)
    ? input.stage_2_plan
      .filter((item) => typeof item === 'string' && item.trim())
      .map((item) => item.trim())
    : [];

  let stage3Actions = Array.isArray(input.stage_3_actions)
    ? input.stage_3_actions
      .map((action) => sanitizeAction(action))
      .filter((action) => action && action.type === 'open_url')
      .slice(0, 1)
    : [];

  if (!stage3Actions.length) {
    const inferredUrl = inferOpenUrlFromPrompt(prompt);
    if (inferredUrl) {
      stage3Actions = [{ type: 'open_url', url: inferredUrl, reason: 'Inferred from prompt' }];
    }
  }

  const stage2Final = stage2.length
    ? stage2
    : ['Open target website', 'Find target entity', 'Complete requested action'];

  const stage4 = getText(input.stage_4_user_message, 'Plan ready for approval.');

  return {
    stage1,
    stage2: stage2Final.slice(0, MAX_ACTIONS_PER_PLAN),
    stage3Actions,
    stage4
  };
};

const sanitizeAction = (rawAction) => {
  if (!rawAction || typeof rawAction !== 'object') {
    return null;
  }

  const type = normalizeActionType(rawAction.type || rawAction.action || rawAction.name);
  if (!type) {
    return null;
  }

  const target = getText(rawAction.target || rawAction.text || rawAction.label || rawAction.query, '');

  const action = {
    type,
    url: normalizeUrl(getText(rawAction.url || rawAction.href, '')),
    selector: getText(rawAction.selector || rawAction.css || rawAction.cssSelector, ''),
    target,
    value: getText(rawAction.value || rawAction.input || rawAction.content || rawAction.comment, ''),
    direction: normalizeDirection(rawAction.direction),
    amount: normalizeAmount(rawAction.amount),
    timeoutMs: normalizeTimeout(rawAction.timeoutMs || rawAction.timeout || rawAction.waitMs),
    reason: getText(rawAction.reason, '')
  };

  if (action.type === 'open_url' && !action.url) {
    action.url = normalizeUrl(target);
  }

  if (action.type === 'type' && !action.value) {
    action.value = getText(rawAction.textToType || rawAction.message || rawAction.text, '');
  }

  if (action.type === 'open_url' && !action.url) {
    return null;
  }

  if (action.type === 'click' && !action.selector && !action.target) {
    return null;
  }

  if (action.type === 'type' && !action.value) {
    return null;
  }

  return action;
};

const normalizeActionType = (value) => {
  const type = getText(value, '').toLowerCase();
  if (!type) {
    return '';
  }

  if (['open_url', 'open', 'navigate', 'goto', 'go_to', 'go'].includes(type)) {
    return 'open_url';
  }
  if (['click', 'tap', 'press', 'select'].includes(type)) {
    return 'click';
  }
  if (['type', 'input', 'fill', 'enter', 'write'].includes(type)) {
    return 'type';
  }
  if (['scroll', 'scroll_page'].includes(type)) {
    return 'scroll';
  }
  if (['wait', 'sleep', 'pause'].includes(type)) {
    return 'wait';
  }
  if (['extract', 'read', 'get_text', 'find'].includes(type)) {
    return 'extract';
  }
  if (['screenshot', 'capture'].includes(type)) {
    return 'screenshot';
  }

  return '';
};

const normalizeDirection = (value) => {
  const direction = getText(value, '').toLowerCase();
  return direction === 'up' ? 'up' : 'down';
};

const normalizeAmount = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return 700;
  }
  return Math.min(4000, Math.max(100, Math.round(Math.abs(num))));
};

const normalizeTimeout = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return 2000;
  }
  return Math.min(30000, Math.max(300, Math.round(num)));
};

const getText = (value, fallback = '') => {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
};

const inferOpenUrlFromPrompt = (prompt) => {
  if (!prompt || typeof prompt !== 'string') {
    return '';
  }

  const lower = prompt.toLowerCase();
  const knownSites = {
    youtube: 'https://www.youtube.com',
    instagram: 'https://www.instagram.com',
    google: 'https://www.google.com',
    github: 'https://github.com',
    linkedin: 'https://www.linkedin.com',
    twitter: 'https://x.com',
    x: 'https://x.com'
  };

  for (const [key, url] of Object.entries(knownSites)) {
    if (lower.includes(key)) {
      return url;
    }
  }

  const domainMatch = prompt.match(/((https?:\/\/)?[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?)/);
  if (domainMatch && domainMatch[1]) {
    return normalizeUrl(domainMatch[1]);
  }

  return '';
};

const normalizeUrl = (raw) => {
  if (!raw || typeof raw !== 'string') {
    return '';
  }

  const cleaned = raw.trim().replace(/[),.;]+$/, '');
  if (!cleaned) {
    return '';
  }

  const withProtocol = /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;
  try {
    const url = new URL(withProtocol);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return '';
    }
    return url.toString();
  } catch (error) {
    return '';
  }
};

const describeAction = (action) => {
  if (action.type === 'open_url') {
    return `Open ${action.url}`;
  }
  if (action.type === 'click') {
    return `Click ${action.selector || `text "${action.target}"`}`;
  }
  if (action.type === 'type') {
    const target = action.selector || action.target || 'input field';
    return `Type into ${target}`;
  }
  if (action.type === 'scroll') {
    return `Scroll ${action.direction} by ${action.amount}px`;
  }
  if (action.type === 'wait') {
    return `Wait ${action.timeoutMs}ms`;
  }
  if (action.type === 'extract') {
    return `Extract ${action.selector || action.target || 'page text'}`;
  }
  if (action.type === 'screenshot') {
    return 'Capture screenshot';
  }
  return action.type;
};

const executeAdaptivePlan = async (plan) => {
  const bootstrapResults = [];
  const goalResults = [];
  let stoppedByUser = false;

  for (const bootstrapAction of plan.stage3Actions) {
    if (state.stopRequested) {
      stoppedByUser = true;
      break;
    }

    bootstrapResults.push(await executeSingleAction(bootstrapAction));
  }

  for (let i = 0; i < plan.stage2.length && !stoppedByUser; i += 1) {
    if (state.stopRequested) {
      stoppedByUser = true;
      break;
    }

    const goal = plan.stage2[i];
    const goalResult = await executeGoalLoop({
      prompt: plan.originalPrompt,
      goal,
      goalIndex: i,
      totalGoals: plan.stage2.length
    });
    goalResults.push(goalResult);
    if (!goalResult.completed) {
      break;
    }
  }

  return {
    bootstrapResults,
    goalResults,
    stoppedByUser
  };
};

const executeGoalLoop = async ({ prompt, goal, goalIndex, totalGoals }) => {
  const history = [];
  const actionResults = [];
  let completed = false;
  let completionNote = '';

  for (let i = 0; i < MAX_ITERATIONS_PER_GOAL; i += 1) {
    if (state.stopRequested) {
      completionNote = 'Stopped by user.';
      break;
    }

    const observation = await collectObservation();

    const decision = await requestNextActionDecision({
      prompt,
      goal,
      goalIndex,
      totalGoals,
      history,
      observation
    });

    if (decision.goalStatus === 'done') {
      const verificationObservation = await collectObservation();
      const verification = await requestGoalVerification({
        prompt,
        goal,
        goalIndex,
        totalGoals,
        history,
        observation: verificationObservation
      });

      if (verification.verifiedDone) {
        completed = true;
        completionNote = verification.reason || decision.progressNote || 'Goal completed.';
        break;
      }

      if (verification.suggestedNextAction) {
        const verifyActionResult = await executeSingleAction(verification.suggestedNextAction);
        actionResults.push({
          ...verifyActionResult,
          iteration: i + 1
        });

        history.push({
          iteration: i + 1,
          goal_status: 'in_progress',
          progress_note: verification.reason || 'Verification requested another action',
          action: verification.suggestedNextAction,
          result_status: verifyActionResult.status,
          result_detail: verifyActionResult.detail
        });
      }

      continue;
    }

    if (!decision.nextAction) {
      completionNote = decision.progressNote || 'No next action returned.';
      if (decision.goalStatus === 'blocked') {
        break;
      }
      continue;
    }

    const result = await executeSingleAction(decision.nextAction);
    actionResults.push({
      ...result,
      iteration: i + 1
    });

    history.push({
      iteration: i + 1,
      goal_status: decision.goalStatus,
      progress_note: decision.progressNote || '',
      action: decision.nextAction,
      result_status: result.status,
      result_detail: result.detail
    });

    if (decision.goalStatus === 'blocked' && result.status === 'failed') {
      completionNote = decision.progressNote || 'Goal blocked.';
      break;
    }

    if (result.status === 'failed') {
      continue;
    }
  }

  if (!completed && !completionNote) {
    completionNote = 'Goal not completed within iteration budget.';
  }

  return {
    goal,
    completed,
    completionNote,
    actionResults
  };
};

const executeSingleAction = async (action) => {
  try {
    if (action.type === 'open_url') {
      const tab = await getActiveTab();
      await chrome.tabs.update(tab.id, { url: action.url });
      await waitForTabLoaded(tab.id, 15000);
      return { action: describeAction(action), status: 'success', detail: `Opened ${action.url}` };
    }

    if (action.type === 'click') {
      const tab = await getActiveTab();
      const outcome = await runInTab(tab.id, performClickInPage, [action]);
      if (!outcome || !outcome.ok) {
        return { action: describeAction(action), status: 'failed', detail: outcome && outcome.error ? outcome.error : 'Click target not found' };
      }
      return { action: describeAction(action), status: 'success', detail: outcome.detail || 'Clicked element' };
    }

    if (action.type === 'type') {
      const tab = await getActiveTab();
      const outcome = await runInTab(tab.id, performTypeInPage, [action]);
      if (!outcome || !outcome.ok) {
        return { action: describeAction(action), status: 'failed', detail: outcome && outcome.error ? outcome.error : 'Input target not found' };
      }
      return { action: describeAction(action), status: 'success', detail: outcome.detail || 'Typed text' };
    }

    if (action.type === 'scroll') {
      const tab = await getActiveTab();
      const outcome = await runInTab(tab.id, performScrollInPage, [action]);
      return { action: describeAction(action), status: outcome && outcome.ok ? 'success' : 'failed', detail: outcome && outcome.detail ? outcome.detail : 'Scroll completed' };
    }

    if (action.type === 'wait') {
      const tab = await getActiveTab();
      const outcome = await runInTab(tab.id, performWaitInPage, [action]);
      return { action: describeAction(action), status: outcome && outcome.ok ? 'success' : 'failed', detail: outcome && outcome.detail ? outcome.detail : 'Wait completed' };
    }

    if (action.type === 'extract') {
      const tab = await getActiveTab();
      const outcome = await runInTab(tab.id, performExtractInPage, [action]);
      if (!outcome || !outcome.ok) {
        return { action: describeAction(action), status: 'failed', detail: outcome && outcome.error ? outcome.error : 'Extraction failed' };
      }
      const preview = outcome.items && outcome.items.length ? `Extracted: ${outcome.items.slice(0, 2).join(' | ')}` : 'Extracted text';
      return { action: describeAction(action), status: 'success', detail: preview };
    }

    if (action.type === 'screenshot') {
      const tab = await getActiveTab();
      const base64 = await captureScreenshotBase64(tab.windowId);
      if (!base64) {
        return { action: describeAction(action), status: 'failed', detail: 'Screenshot failed' };
      }
      return { action: describeAction(action), status: 'success', detail: `Screenshot captured (${base64.length} base64 chars)` };
    }

    return { action: describeAction(action), status: 'skipped', detail: `Unsupported action type: ${action.type}` };
  } catch (error) {
    return { action: describeAction(action), status: 'failed', detail: error && error.message ? error.message : 'Action failed' };
  }
};

const getActiveTab = async () => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs && tabs[0];
  if (!tab || typeof tab.id !== 'number') {
    throw new Error('No active tab found.');
  }
  return tab;
};

const waitForTabLoaded = (tabId, timeoutMs = 12000) => {
  return new Promise((resolve) => {
    let done = false;

    const finish = () => {
      if (done) {
        return;
      }
      done = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    };

    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        finish();
      }
    };

    const timer = setTimeout(finish, timeoutMs);
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId).then((tab) => {
      if (tab && tab.status === 'complete') {
        finish();
      }
    }).catch(() => {
      // ignore
    });
  });
};

const runInTab = async (tabId, func, args = []) => {
  const result = await chrome.scripting.executeScript({
    target: { tabId },
    func,
    args
  });
  return result && result[0] ? result[0].result : null;
};

const collectObservation = async () => {
  const tab = await getActiveTab();
  let dom = {
    title: tab.title || '',
    url: tab.url || '',
    elements: []
  };

  try {
    const snapshot = await runInTab(tab.id, collectDomSnapshotInPage, [{ maxItems: 140 }]);
    if (snapshot && typeof snapshot === 'object') {
      dom = snapshot;
    }
  } catch (error) {
    dom.error = 'Failed to collect DOM snapshot';
  }

  let screenshotBase64 = '';
  try {
    screenshotBase64 = await captureScreenshotBase64(tab.windowId);
  } catch (error) {
    screenshotBase64 = '';
  }

  return {
    url: tab.url || '',
    title: tab.title || '',
    dom,
    screenshotBase64
  };
};

const captureScreenshotBase64 = async (windowId) => {
  const dataUrl = await chrome.tabs.captureVisibleTab(windowId, {
    format: 'jpeg',
    quality: 40
  });
  if (typeof dataUrl !== 'string' || !dataUrl.includes(',')) {
    return '';
  }
  return dataUrl.split(',')[1] || '';
};

const truncateBase64 = (base64) => {
  if (!base64) {
    return '';
  }
  if (base64.length <= MAX_SCREENSHOT_BASE64_CHARS) {
    return base64;
  }
  return base64.slice(0, MAX_SCREENSHOT_BASE64_CHARS);
};

function collectDomSnapshotInPage(config) {
  const maxItems = config && Number.isFinite(config.maxItems) ? Math.max(20, config.maxItems) : 70;

  const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const isVisible = (el) => {
    if (!el) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  };

  const selectorHint = (el) => {
    if (!el || !el.tagName) {
      return '';
    }
    if (el.id) {
      return `${el.tagName.toLowerCase()}#${el.id}`;
    }
    const className = normalize(el.className).split(' ')[0];
    if (className) {
      return `${el.tagName.toLowerCase()}.${className}`;
    }
    return el.tagName.toLowerCase();
  };

  const textFor = (el) => {
    return normalize(
      el.innerText ||
      el.textContent ||
      el.getAttribute('aria-label') ||
      el.getAttribute('placeholder') ||
      el.value ||
      ''
    ).slice(0, 140);
  };

  const nodes = Array.from(
    document.querySelectorAll('a,button,input,textarea,select,[role="button"],[role="textbox"],[contenteditable="true"],h1,h2,h3')
  );

  const elements = [];
  for (const node of nodes) {
    if (!isVisible(node)) {
      continue;
    }
    const text = textFor(node);
    if (!text) {
      continue;
    }
    elements.push({
      tag: node.tagName.toLowerCase(),
      text,
      selector: selectorHint(node)
    });
    if (elements.length >= maxItems) {
      break;
    }
  }

  const pageText = normalize(document.body ? document.body.innerText : '').slice(0, 2000);

  return {
    title: document.title,
    url: window.location.href,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      scrollY: window.scrollY
    },
    elements,
    pageText
  };
}

function performClickInPage(action) {
  const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const isVisible = (el) => {
    if (!el) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  };

  const descriptor = (el) => {
    const base = el.tagName.toLowerCase();
    if (el.id) {
      return `${base}#${el.id}`;
    }
    const className = String(el.className || '').trim().split(/\s+/).filter(Boolean)[0];
    return className ? `${base}.${className}` : base;
  };

  const textFor = (el) => {
    return normalize(
      el.innerText ||
      el.textContent ||
      el.value ||
      el.getAttribute('aria-label') ||
      el.getAttribute('title') ||
      ''
    );
  };

  const findByText = (text) => {
    const needle = normalize(text);
    if (!needle) {
      return null;
    }
    const candidates = Array.from(document.querySelectorAll('a,button,[role="button"],input[type="button"],input[type="submit"],yt-formatted-string,span,div'));
    let best = null;
    for (let i = 0; i < candidates.length && i < 2200; i += 1) {
      const el = candidates[i];
      if (!isVisible(el)) {
        continue;
      }
      const textValue = textFor(el);
      if (!textValue) {
        continue;
      }
      let score = -1;
      if (textValue === needle) {
        score = 1000;
      } else if (textValue.startsWith(needle)) {
        score = 850;
      } else if (textValue.includes(needle)) {
        score = 700;
      }
      if (score < 0) {
        continue;
      }
      score -= i / 100;
      if (!best || score > best.score) {
        best = { el, score };
      }
    }
    return best ? best.el : null;
  };

  let element = null;
  if (action.selector) {
    try {
      element = document.querySelector(action.selector);
    } catch (error) {
      element = null;
    }
  }

  if ((!element || !isVisible(element)) && action.target) {
    element = findByText(action.target);
  }

  if (!element) {
    return { ok: false, error: 'Element not found for click' };
  }

  if (typeof element.closest === 'function') {
    const clickableAncestor = element.closest('button,a,[role="button"]');
    if (clickableAncestor && isVisible(clickableAncestor)) {
      element = clickableAncestor;
    }
  }

  try {
    element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'auto' });
  } catch (error) {
    // ignore
  }

  try {
    element.click();
    return { ok: true, detail: `Clicked ${descriptor(element)}` };
  } catch (error) {
    return { ok: false, error: error && error.message ? error.message : 'Click failed' };
  }
}

function performTypeInPage(action) {
  const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const isVisible = (el) => {
    if (!el) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  };

  const descriptor = (el) => {
    const base = el.tagName.toLowerCase();
    if (el.id) {
      return `${base}#${el.id}`;
    }
    const className = String(el.className || '').trim().split(/\s+/).filter(Boolean)[0];
    return className ? `${base}.${className}` : base;
  };

  const labelText = (el) => {
    if (!el) {
      return '';
    }
    let text = '';
    if (el.labels && el.labels.length) {
      text = Array.from(el.labels).map((label) => label.innerText || label.textContent || '').join(' ');
    }
    if (!text && el.id) {
      const label = document.querySelector(`label[for="${el.id}"]`);
      if (label) {
        text = label.innerText || label.textContent || '';
      }
    }
    return normalize(text);
  };

  const fieldText = (el) => {
    return normalize(
      el.getAttribute('placeholder') ||
      el.getAttribute('aria-label') ||
      el.name ||
      el.id ||
      labelText(el) ||
      ''
    );
  };

  const findField = (hint) => {
    const needle = normalize(hint);
    const inputs = Array.from(document.querySelectorAll('textarea,input,[contenteditable="true"],[role="textbox"]'));
    let best = null;
    for (let i = 0; i < inputs.length && i < 1000; i += 1) {
      const input = inputs[i];
      if (!isVisible(input)) {
        continue;
      }
      const textValue = fieldText(input);
      let score = 0;
      if (!needle) {
        score = 10;
      } else if (textValue === needle) {
        score = 1000;
      } else if (textValue.includes(needle)) {
        score = 800;
      } else if ((input.innerText || '').toLowerCase().includes(needle)) {
        score = 700;
      } else {
        continue;
      }
      score -= i / 100;
      if (!best || score > best.score) {
        best = { input, score };
      }
    }
    return best ? best.input : null;
  };

  let element = null;
  if (action.selector) {
    try {
      element = document.querySelector(action.selector);
    } catch (error) {
      element = null;
    }
  }

  if ((!element || !isVisible(element)) && action.target) {
    element = findField(action.target);
  }

  if (!element) {
    element = findField('');
  }

  if (!element) {
    return { ok: false, error: 'Input field not found' };
  }

  try {
    element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'auto' });
  } catch (error) {
    // ignore
  }

  if (typeof element.focus === 'function') {
    element.focus();
  }

  const value = String(action.value || '');
  if (!value) {
    return { ok: false, error: 'Missing text to type' };
  }

  if (element.isContentEditable || element.getAttribute('contenteditable') === 'true') {
    element.textContent = value;
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
    return { ok: true, detail: `Typed into ${descriptor(element)}` };
  }

  const tag = element.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea') {
    const proto = tag === 'textarea' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const valueDescriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    if (valueDescriptor && typeof valueDescriptor.set === 'function') {
      valueDescriptor.set.call(element, value);
    } else {
      element.value = value;
    }
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, detail: `Typed into ${descriptor(element)}` };
  }

  return { ok: false, error: 'Target element is not text-input capable' };
}

function performScrollInPage(action) {
  const amount = Number(action.amount) || 700;
  const direction = action.direction === 'up' ? -1 : 1;
  window.scrollBy({
    top: direction * amount,
    left: 0,
    behavior: 'smooth'
  });
  return { ok: true, detail: `Scrolled ${action.direction || 'down'} by ${amount}px` };
}

function performWaitInPage(action) {
  const timeoutMs = Number(action.timeoutMs) || 2000;
  const selector = String(action.selector || '').trim();
  const target = String(action.target || '').trim().toLowerCase();

  const textExists = () => {
    if (!target) {
      return false;
    }
    const nodes = Array.from(document.querySelectorAll('body *'));
    for (let i = 0; i < nodes.length && i < 2500; i += 1) {
      const text = String(nodes[i].innerText || nodes[i].textContent || '').toLowerCase();
      if (text.includes(target)) {
        return true;
      }
    }
    return false;
  };

  return new Promise((resolve) => {
    const startedAt = Date.now();
    if (!selector && !target) {
      setTimeout(() => resolve({ ok: true, detail: `Waited ${timeoutMs}ms` }), timeoutMs);
      return;
    }

    const timer = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      let found = false;

      if (selector) {
        try {
          found = Boolean(document.querySelector(selector));
        } catch (error) {
          found = false;
        }
      } else {
        found = textExists();
      }

      if (found) {
        window.clearInterval(timer);
        resolve({ ok: true, detail: 'Wait condition met' });
        return;
      }

      if (elapsed >= timeoutMs) {
        window.clearInterval(timer);
        resolve({ ok: false, detail: `Wait timed out after ${timeoutMs}ms` });
      }
    }, 200);
  });
}

function performExtractInPage(action) {
  const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const maxItems = 5;
  let items = [];

  if (action.selector) {
    try {
      items = Array.from(document.querySelectorAll(action.selector))
        .map((el) => normalize(el.innerText || el.textContent || el.value || ''))
        .filter(Boolean)
        .slice(0, maxItems);
    } catch (error) {
      return { ok: false, error: 'Invalid extract selector' };
    }
  } else {
    const target = normalize(action.target).toLowerCase();
    const nodes = Array.from(document.querySelectorAll('h1,h2,h3,p,a,button,span,yt-formatted-string'));
    items = nodes
      .map((el) => normalize(el.innerText || el.textContent || ''))
      .filter(Boolean)
      .filter((text) => !target || text.toLowerCase().includes(target))
      .slice(0, maxItems);
  }

  if (!items.length) {
    return { ok: false, error: 'No extractable content found' };
  }

  return { ok: true, items };
}

const formatPlanCreatedMessage = (plan) => {
  const steps = plan.stage2.map((step, index) => `${index + 1}. ${step}`).join('\n');
  const bootstrap = plan.stage3Actions.length
    ? plan.stage3Actions.map((action) => `- ${describeAction(action)}`).join('\n')
    : '- none';

  return [
    'Stage 1 - Prompt + Observation',
    plan.stage1,
    'Observation captured: screenshot(base64) + DOM snapshot.',
    '',
    'Stage 2 - High-Level Plan',
    steps || '1. No plan steps',
    '',
    'Stage 3 - Bootstrap Action (pending approval)',
    bootstrap,
    '',
    'Stage 4 - Approval',
    'Review the plan card and click Approve Plan.'
  ].join('\n');
};

const formatExecutionReport = (plan, executionResult) => {
  const lines = [];

  lines.push('Stage 1 - Prompt');
  lines.push(plan.stage1);
  lines.push('');

  lines.push('Stage 2 - High-Level Plan');
  plan.stage2.forEach((step, index) => lines.push(`${index + 1}. ${step}`));
  lines.push('');

  lines.push('Stage 3 - Execute (adaptive next-action loop)');
  if (executionResult.bootstrapResults.length) {
    lines.push('Bootstrap:');
    executionResult.bootstrapResults.forEach((result) => {
      lines.push(`- ${result.action}: ${result.status} (${result.detail})`);
    });
  }

  executionResult.goalResults.forEach((goalResult, index) => {
    lines.push(`Goal ${index + 1}: ${goalResult.goal}`);
    goalResult.actionResults.forEach((result) => {
      lines.push(`- Iter ${result.iteration}: ${result.action}: ${result.status} (${result.detail})`);
    });
    lines.push(`- Goal status: ${goalResult.completed ? 'done' : 'not done'} (${goalResult.completionNote})`);
  });
  if (executionResult.stoppedByUser) {
    lines.push('Execution stopped by user.');
  }
  lines.push('');

  lines.push('Stage 4 - Result');
  lines.push(plan.stage4);
  return lines.join('\n');
};

const extractAssistantText = (data) => {
  const message = data && data.choices && data.choices[0] && data.choices[0].message
    ? data.choices[0].message.content
    : '';

  if (typeof message === 'string') {
    return message.trim();
  }

  if (Array.isArray(message)) {
    return message
      .map((item) => {
        if (typeof item === 'string') {
          return item;
        }
        if (item && typeof item.text === 'string') {
          return item.text;
        }
        return '';
      })
      .join('\n')
      .trim();
  }

  return '';
};

const renderPlanReview = () => {
  const plan = state.pendingPlan;
  if (!plan) {
    elements.planReview.classList.add('hidden');
    elements.planSummary.textContent = '';
    elements.planSteps.innerHTML = '';
    elements.planSites.innerHTML = '';
    return;
  }

  elements.planReview.classList.remove('hidden');
  elements.planSummary.textContent = plan.stage1;
  elements.planSteps.innerHTML = '';
  elements.planSites.innerHTML = '';

  plan.stage2.forEach((step) => {
    const item = document.createElement('li');
    item.textContent = step;
    elements.planSteps.appendChild(item);
  });

  const hosts = new Set();
  plan.stage3Actions.forEach((action) => {
    if (!action.url) {
      return;
    }
    try {
      hosts.add(new URL(action.url).host);
    } catch (error) {
      // ignore
    }
  });

  if (!hosts.size && plan.contextUrl) {
    try {
      hosts.add(new URL(plan.contextUrl).host);
    } catch (error) {
      // ignore
    }
  }

  [...hosts].forEach((host) => {
    const chip = document.createElement('span');
    chip.className = 'plan-site';
    chip.textContent = host;
    elements.planSites.appendChild(chip);
  });
};

const appendMessage = (role, content) => {
  const next = { role, content: content.trim() };
  state.messages.push(next);
  if (state.messages.length > MAX_SAVED_MESSAGES) {
    state.messages = state.messages.slice(-MAX_SAVED_MESSAGES);
  }
  persistMessages();
  renderMessages();
};

const persistMessages = async () => {
  await chrome.storage.local.set({
    [STORAGE_KEYS.messages]: state.messages
  });
};

const renderMessages = () => {
  elements.messages.innerHTML = '';

  if (!state.messages.length) {
    const placeholder = document.createElement('div');
    placeholder.className = 'message assistant placeholder';
    placeholder.textContent = 'Try: open youtube channel of mr beast and subscribe';
    elements.messages.appendChild(placeholder);
    return;
  }

  state.messages.forEach((message) => {
    const bubble = document.createElement('div');
    bubble.className = `message ${message.role}`;
    bubble.textContent = message.content;
    elements.messages.appendChild(bubble);
  });

  elements.messages.scrollTop = elements.messages.scrollHeight;
};

const updateComposerState = () => {
  const lockedForApproval = Boolean(state.pendingPlan);
  const disabled = state.isPlanning || state.isExecuting || lockedForApproval;
  const running = state.isPlanning || state.isExecuting;

  elements.promptInput.disabled = disabled;
  elements.sendBtn.disabled = disabled;
  elements.stopBtn.disabled = !running || state.stopRequested;
  elements.approvePlanBtn.disabled = state.isPlanning || state.isExecuting || !state.pendingPlan;
  elements.cancelPlanBtn.disabled = state.isPlanning || state.isExecuting || !state.pendingPlan;

  if (state.stopRequested) {
    elements.stopBtn.textContent = 'Stopping...';
  } else {
    elements.stopBtn.textContent = 'Stop';
  }

  if (state.isPlanning) {
    elements.sendBtn.textContent = 'Planning...';
    return;
  }

  if (state.isExecuting) {
    elements.sendBtn.textContent = 'Executing...';
    return;
  }

  if (lockedForApproval) {
    elements.sendBtn.textContent = 'Waiting Approval';
    return;
  }

  elements.sendBtn.textContent = 'Send';
};

const showError = (node, text) => {
  node.textContent = text;
  node.classList.remove('hidden');
};

const hideError = (node) => {
  node.textContent = '';
  node.classList.add('hidden');
};

init();
