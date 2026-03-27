import OpenAI from 'openai';
import { generatePrompt } from '../prompts';
import { isAgenticToolName } from '../../shared/agent_tools';
import { recordLlmUsage } from './llm_usage';
import type { SubGoal } from '../../shared/types';
import type { AgentStep, AgentStepCheck, PlannerResult } from './types';

const MAX_WAIT_TIMEOUT_MS = 2_000;

function safeJsonParse<T>(input: string, fallback: T): T {
  try {
    const cleaned = input.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return fallback;
  }
}

function clampWaitArgs(tool: AgentStep['tool'], args: Record<string, unknown>): Record<string, unknown> {
  if (tool !== 'wait_for_element' && tool !== 'wait_for_text') return args;
  const timeoutMs = typeof args.timeoutMs === 'number' ? args.timeoutMs : Number(args.timeoutMs);
  return {
    ...args,
    timeoutMs: Number.isFinite(timeoutMs)
      ? Math.max(0, Math.min(timeoutMs, MAX_WAIT_TIMEOUT_MS))
      : MAX_WAIT_TIMEOUT_MS
  };
}

function normalizeTool(value: unknown): AgentStep['tool'] | null {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return null;
  const aliases: Record<string, AgentStep['tool']> = {
    wait: 'wait_for_element',
    type_text: 'type',
    click_element: 'click',
    navigate_to: 'go_to_url',
    navigate: 'go_to_url',
    extract_data: 'extract'
  };
  const normalized = aliases[raw] ?? raw;
  return isAgenticToolName(normalized) ? normalized : null;
}

function collectInvalidToolNames(items: unknown[]): string[] {
  const invalid = new Set<string>();

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const tool = (item as Record<string, unknown>).tool;
    if (typeof tool === 'string' && !normalizeTool(tool)) {
      invalid.add(tool);
    }
  }

  return [...invalid];
}

function normalizeCheck(item: unknown): AgentStepCheck | undefined {
  if (!item || typeof item !== 'object') return undefined;
  const candidate = item as Record<string, unknown>;
  const tool = normalizeTool(candidate.tool);
  if (!tool) return undefined;
  const args = (candidate.args && typeof candidate.args === 'object')
    ? candidate.args as Record<string, unknown>
    : {};
  const normalizedArgs = clampWaitArgs(tool, args);

  if (tool === 'wait_for_text' && typeof normalizedArgs.text !== 'string') return undefined;
  if (tool === 'go_to_url' && typeof normalizedArgs.url !== 'string') return undefined;

  return { tool, args: normalizedArgs };
}

function normalizeAction(item: unknown, allowAlternates = true): AgentStep | null {
  if (!item || typeof item !== 'object') return null;
  const candidate = item as Record<string, unknown>;
  const tool = normalizeTool(candidate.tool);
  if (!tool) return null;
  const args = ((candidate.args && typeof candidate.args === 'object')
    ? candidate.args as Record<string, unknown>
    : {}) as Record<string, unknown>;
  const normalizedArgs = clampWaitArgs(tool, args);

  if (tool === 'go_to_url' && typeof normalizedArgs.url !== 'string') {
    const queryUrl = typeof normalizedArgs.query === 'string' ? normalizedArgs.query.trim() : '';
    if (/^https?:\/\//i.test(queryUrl)) normalizedArgs.url = queryUrl;
  }
  if (tool === 'type' && typeof normalizedArgs.text !== 'string') {
    const text = [
      candidate.text,
      normalizedArgs.value,
      normalizedArgs.content,
      normalizedArgs.message
    ].find((value) => typeof value === 'string' && value.trim().length > 0);
    if (typeof text === 'string') normalizedArgs.text = text;
  }

  if (tool === 'go_to_url' && typeof normalizedArgs.url !== 'string') return null;
  if (tool === 'type' && typeof normalizedArgs.text !== 'string') return null;
  if (tool === 'wait_for_text' && typeof normalizedArgs.text !== 'string') return null;
  if (tool === 'press_key' && typeof normalizedArgs.key !== 'string') return null;

  const check = normalizeCheck(candidate.check);
  const alternates = allowAlternates && Array.isArray(candidate.alternates)
    ? candidate.alternates
      .map((alt) => normalizeAction(alt, false))
      .filter((value): value is AgentStep => Boolean(value))
      .slice(0, 3)
    : undefined;

  return {
    tool,
    args: normalizedArgs,
    why: typeof candidate.why === 'string' ? candidate.why : undefined,
    check,
    alternates: alternates?.length ? alternates : undefined
  };
}

function extractUrlFromGoal(goal: string): string | null {
  const directUrl = goal.match(/https?:\/\/[^\s]+/i)?.[0];
  if (directUrl) return directUrl.replace(/[),.;!?]+$/, '');

  const g = goal.toLowerCase();
  const siteMap: Record<string, string> = {
    youtube: 'https://www.youtube.com',
    twitter: 'https://www.twitter.com',
    instagram: 'https://www.instagram.com',
    reddit: 'https://www.reddit.com',
    github: 'https://www.github.com',
    linkedin: 'https://www.linkedin.com',
    amazon: 'https://www.amazon.com',
    google: 'https://www.google.com'
  };

  for (const [keyword, url] of Object.entries(siteMap)) {
    if (g.includes(keyword)) return url;
  }
  return null;
}

function actionToStepText(action: AgentStep): string {
  const query = typeof action.args.query === 'string' ? action.args.query : '';

  switch (action.tool) {
    case 'go_to_url': {
      const url = typeof action.args.url === 'string' ? action.args.url : '';
      return `Go to ${url || query}`;
    }
    case 'type': {
      const text = typeof action.args.text === 'string' ? action.args.text : '';
      return `Type '${text}' into ${query || 'input'}`;
    }
    case 'click':
      return `Click ${query}`;
    case 'find':
    case 'find_by_text':
      return `Find '${query}'`;
    case 'find_input':
      return `Find ${query} field`;
    case 'input_byid':
      return 'Find input by exact selector/id/class/name';
    case 'find_button':
      return `Find '${query}' button`;
    case 'button_byid':
      return 'Find button by exact selector/id/class/name';
    case 'find_buttons':
      return `Find matching '${query}' buttons`;
    case 'press_key': {
      const key = typeof action.args.key === 'string' ? action.args.key : '';
      return `Press ${key}`;
    }
    case 'scroll': {
      const direction = typeof action.args.direction === 'string' ? action.args.direction : '';
      return `Scroll ${direction}`;
    }
    case 'wait_for_element':
      return `Wait for '${query}'`;
    case 'wait_for_text': {
      const text = typeof action.args.text === 'string' ? action.args.text : '';
      return `Wait for '${text}'`;
    }
    case 'get_page_text':
      return 'Capture page text';
    case 'get_visible_elements':
      return 'Capture visible elements';
    case 'understand_screen':
      return 'Check page state';
    case 'think':
      return 'Think and choose the next action';
    case 'visual_click': {
      const description = typeof action.args.description === 'string' ? action.args.description : '';
      return `Visual click: ${description}`;
    }
    case 'click_coordinates': {
      const x = typeof action.args.x === 'number' ? action.args.x : Number(action.args.x);
      const y = typeof action.args.y === 'number' ? action.args.y : Number(action.args.y);
      return `Click coordinates (${Number.isFinite(x) ? x : '?'}, ${Number.isFinite(y) ? y : '?'})`;
    }
    case 'random_coordinates_by_text': {
      const text = typeof action.args.text === 'string' ? action.args.text : '';
      return `Get random coordinates for '${text}'`;
    }
    default:
      return `${action.tool}: ${query}`;
  }
}

function getInitialUrl(actions: AgentStep[]): string | null {
  const firstNav = actions.find((action) => action.tool === 'go_to_url');
  const url = firstNav && typeof firstNav.args.url === 'string' ? firstNav.args.url : null;
  return url && /^https?:\/\//i.test(url) ? url : null;
}

function patchSearchSubmit(actions: AgentStep[]): AgentStep[] {
  const output: AgentStep[] = [];
  for (let i = 0; i < actions.length; i += 1) {
    const current = actions[i];
    output.push(current);
    if (current.tool !== 'type') continue;

    const query = typeof current.args.query === 'string' ? current.args.query.toLowerCase() : '';
    if (!query.includes('search')) continue;

    const next = actions[i + 1];
    const hasSubmit =
      !!next &&
      (
        next.tool === 'press_key' ||
        next.tool === 'click' ||
        next.tool === 'go_to_url' ||
        next.tool === 'wait_for_element' ||
        next.tool === 'wait_for_text'
      );

    if (!hasSubmit) {
      output.push({
        tool: 'press_key',
        args: { key: 'Enter', query: current.args.query ?? 'search' },
        why: 'submit search after typing'
      });
    }
  }
  return output;
}

function shouldCollapseAfterThink(action: AgentStep | undefined): boolean {
  if (!action) return false;
  return action.tool === 'click'
    || action.tool === 'click_coordinates'
    || action.tool === 'visual_click'
    || action.tool === 'button_byid'
    || action.tool === 'random_coordinates_by_text';
}

function collapseThinkFollowUps(actions: AgentStep[]): AgentStep[] {
  const output: AgentStep[] = [];

  for (let i = 0; i < actions.length; i += 1) {
    const current = actions[i];
    output.push(current);

    if (current.tool !== 'think') continue;

    const next = actions[i + 1];
    if (shouldCollapseAfterThink(next)) {
      i += 1;
    }
  }

  return output;
}

function modelSupportsJsonObject(model: string): boolean {
  const m = model.toLowerCase();
  return m.includes('gpt-4o') || m.includes('gpt-4.1') || m.includes('gpt-5');
}

function parseSubGoals(raw: string, fallbackGoal: string): SubGoal[] {
  const parsed = safeJsonParse<unknown>(raw, []);
  const candidates = Array.isArray(parsed)
    ? parsed
    : (
      parsed &&
      typeof parsed === 'object' &&
      Array.isArray((parsed as Record<string, unknown>).subGoals)
    )
      ? (parsed as Record<string, unknown>).subGoals as unknown[]
      : (
        parsed &&
        typeof parsed === 'object' &&
        Array.isArray((parsed as Record<string, unknown>).goals)
      )
        ? (parsed as Record<string, unknown>).goals as unknown[]
        : [];

  const cleaned = candidates
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const c = item as Record<string, unknown>;
      const description = typeof c.description === 'string' ? c.description.trim() : '';
      const completionCriteria = typeof c.completionCriteria === 'string'
        ? c.completionCriteria.trim()
        : '';
      if (!description || !completionCriteria) return null;
      return { description, completionCriteria };
    })
    .filter((item): item is SubGoal => Boolean(item))
    .slice(0, 4);

  if (cleaned.length) return cleaned;
  return [{ description: fallbackGoal, completionCriteria: 'task appears complete' }];
}

export async function decomposeTask(params: {
  goal: string;
  apiKey: string;
  model: string;
  signal: AbortSignal;
}): Promise<SubGoal[]> {
  const { goal, apiKey, model, signal } = params;
  const fallback: SubGoal[] = [{ description: goal, completionCriteria: 'task appears complete' }];
  try {
    const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
    const req: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
      model,
      messages: [
        {
          role: 'system',
          content: 'Break this goal into 2-4 sequential sub-goals. Each must be independently completable. Return JSON array: [{description: string, completionCriteria: string}]. Return ONLY the JSON array.'
        },
        { role: 'user', content: goal }
      ],
      max_completion_tokens: 500
    };
    if (modelSupportsJsonObject(model)) {
      (req as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming & { response_format: { type: 'json_object' } }).response_format = { type: 'json_object' };
    }

    const response = await openai.chat.completions.create(req, { signal });
    await recordLlmUsage({
      source: 'planner.decompose_task',
      model,
      usage: response.usage,
      status: 'success'
    });
    const raw = response.choices[0]?.message?.content ?? '[]';
    return parseSubGoals(raw, goal);
  } catch (error) {
    await recordLlmUsage({
      source: 'planner.decompose_task',
      model,
      status: 'error',
      error: error instanceof Error ? error.message : 'decomposeTask failed'
    });
    return fallback;
  }
}

export async function planGoal(params: {
  goal: string;
  trace: unknown[];
  context: Record<string, unknown>;
  apiKey: string;
  model: string;
  screenshotDataUrl?: string | null;
  signal: AbortSignal;
}): Promise<PlannerResult> {
  const { goal, trace, context, apiKey, model, screenshotDataUrl, signal } = params;
  const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
  const systemPrompt = generatePrompt({ type: 'planning', goal, trace, context });
  let recordedUsage = false;

  const userPayload: OpenAI.Chat.ChatCompletionContentPart[] = [
    {
      type: 'text',
      text: [
        `Current URL: ${String((context.currentPage as { url?: string } | undefined)?.url ?? '')}`,
        `Current Title: ${String((context.currentPage as { title?: string } | undefined)?.title ?? '')}`,
        `Page Snapshot (excerpt): ${String(context.pageSnapshot ?? '').slice(0, 800)}`
      ].join('\n')
    }
  ];
  if (screenshotDataUrl) {
    userPayload.push({ type: 'image_url', image_url: { url: screenshotDataUrl, detail: 'low' } });
  }

  try {
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPayload }
      ],
      // No tools for planning; expect pure JSON text
      max_completion_tokens: 2000
    }, { signal });
    await recordLlmUsage({
      source: 'planner.plan_goal',
      model,
      usage: response.usage,
      status: 'success'
    });
    recordedUsage = true;

    const rawContent = response.choices[0]?.message?.content ?? '[]';
    const parsed = safeJsonParse<unknown>(rawContent, []);
    const actions = Array.isArray(parsed) ? parsed : [];
    const invalidToolNames = collectInvalidToolNames(actions);

    if (invalidToolNames.length) {
      throw new Error(`planner returned invalid tool name(s): ${invalidToolNames.join(', ')}`);
    }

    const normalized = actions
      .map((item) => normalizeAction(item))
      .filter((value): value is AgentStep => Boolean(value))
      .filter((action) => action.tool !== 'get_new_plan'); // prevent self-recursive planning loops

    const patchedActions = collapseThinkFollowUps(patchSearchSubmit(normalized)).slice(0, 16);

    if (!patchedActions.length) {
      const siteUrl = extractUrlFromGoal(goal);
      const fallback: AgentStep[] = siteUrl
        ? [{ tool: 'go_to_url', args: { url: siteUrl }, why: 'fallback navigation' }]
        : [{ tool: 'get_page_text', args: {}, why: 'fallback: read page to orient' }];

      return {
        understanding: goal,
        steps: fallback.map(actionToStepText),
        actions: fallback,
        initialUrl: getInitialUrl(fallback)
      };
    }

    return {
      understanding: `Plan to complete: ${goal}`,
      steps: patchedActions.map(actionToStepText),
      actions: patchedActions,
      initialUrl: getInitialUrl(patchedActions)
    };
  } catch (err) {
    if (!recordedUsage) {
      await recordLlmUsage({
        source: 'planner.plan_goal',
        model,
        status: 'error',
        error: err instanceof Error ? err.message : String(err)
      });
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`planGoal failed: ${message}`);
  }
}

export async function planFallbackAction(params: {
  goal: string;
  trace: unknown[];
  context: Record<string, unknown>;
  apiKey: string;
  model: string;
  signal: AbortSignal;
}): Promise<AgentStep | null> {
  const { goal, trace, context, apiKey, model, signal } = params;
  const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
  const mode = String(context.lastError ?? '').toLowerCase().includes('timeout') ? 'slow' : 'failure';
  let recordedUsage = false;
  const systemPrompt = generatePrompt({
    type: mode === 'slow' ? 'slow' : 'failure',
    goal,
    trace,
    context
  });

  try {
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify({ goal, trace, context }) }
      ],
      max_completion_tokens: 420
    }, { signal });
    await recordLlmUsage({
      source: 'planner.plan_fallback_action',
      model,
      usage: response.usage,
      status: 'success'
    });
    recordedUsage = true;

    const raw = response.choices[0]?.message?.content ?? '{}';
    const parsed = safeJsonParse<Record<string, unknown>>(raw, {});
    const invalidToolNames = collectInvalidToolNames([parsed.next_action, parsed.action]);
    if (invalidToolNames.length) {
      throw new Error(`fallback planner returned invalid tool name(s): ${invalidToolNames.join(', ')}`);
    }
    const fromFailure = normalizeAction(parsed.next_action);
    if (fromFailure) return fromFailure;
    return normalizeAction(parsed.action);
  } catch (error) {
    if (!recordedUsage) {
      await recordLlmUsage({
        source: 'planner.plan_fallback_action',
        model,
        status: 'error',
        error: error instanceof Error ? error.message : 'planFallbackAction failed'
      });
    }
    throw error;
  }
}

export async function replanAfterFailure(params: {
  goal: string;
  trace: unknown[];
  context: Record<string, unknown>;
  apiKey: string;
  model: string;
  screenshotDataUrl?: string | null;
  signal: AbortSignal;
}): Promise<AgentStep[]> {
  const { goal, trace, context, apiKey, model, screenshotDataUrl, signal } = params;
  const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
  let recordedUsage = false;
  const systemPrompt = generatePrompt({
    type: 'not_working',
    goal,
    trace,
    context
  });

  const userPayload: OpenAI.Chat.ChatCompletionContentPart[] = [
    {
      type: 'text',
      text: `Goal: ${goal}\nFailure context:\n${JSON.stringify(context, null, 2)}\nTrace:\n${JSON.stringify(trace, null, 2)}`
    }
  ];
  if (screenshotDataUrl) {
    userPayload.push({ type: 'image_url', image_url: { url: screenshotDataUrl, detail: 'low' } });
  }

  try {
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPayload }
      ],
      max_completion_tokens: 850
    }, { signal });
    await recordLlmUsage({
      source: 'planner.replan_after_failure',
      model,
      usage: response.usage,
      status: 'success'
    });
    recordedUsage = true;

    const raw = response.choices[0]?.message?.content ?? '{}';
    const parsed = safeJsonParse<Record<string, unknown>>(raw, {});
    const stepCandidates = Array.isArray(parsed.steps) ? parsed.steps : [];
    const invalidToolNames = collectInvalidToolNames(stepCandidates);
    if (invalidToolNames.length) {
      throw new Error(`replan returned invalid tool name(s): ${invalidToolNames.join(', ')}`);
    }
    return stepCandidates
      .map((item) => normalizeAction(item))
      .filter((value): value is AgentStep => Boolean(value))
      .slice(0, 8);
  } catch (error) {
    if (!recordedUsage) {
      await recordLlmUsage({
        source: 'planner.replan_after_failure',
        model,
        status: 'error',
        error: error instanceof Error ? error.message : 'replanAfterFailure failed'
      });
    }
    throw error;
  }
}
