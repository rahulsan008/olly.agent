import type { BackgroundToSidebar } from '../../shared/messages';
import type { Plan } from '../../shared/types';
import { emitBridgeEvent } from './bridge';
import { executePlan } from './executor';
import { planGoal } from './planner';
import type { AgentStep, PlannerResult } from './types';

type Send = (msg: BackgroundToSidebar) => void;
type PlanAction = NonNullable<Plan['actions']>[number];

function toAgentStep(raw: PlanAction): AgentStep {
  const check = raw.check && typeof raw.check === 'object'
    ? {
      tool: String(raw.check.tool) as AgentStep['tool'],
      args: (raw.check.args ?? {}) as Record<string, unknown>
    }
    : undefined;

  const alternates = Array.isArray(raw.alternates)
    ? raw.alternates.map((alt) => ({
      tool: String(alt.tool) as AgentStep['tool'],
      args: (alt.args ?? {}) as Record<string, unknown>,
      why: typeof alt.why === 'string' ? alt.why : undefined
    })).slice(0, 3)
    : undefined;

  return {
    tool: String(raw.tool) as AgentStep['tool'],
    args: (raw.args ?? {}) as Record<string, unknown>,
    why: typeof raw.why === 'string' ? raw.why : undefined,
    check,
    alternates: alternates?.length ? alternates : undefined
  };
}

export async function generatePlan(params: {
  goal: string;
  trace: unknown[];
  context: Record<string, unknown>;
  apiKey: string;
  model: string;
  screenshotDataUrl?: string | null;
  signal: AbortSignal;
  send?: Send;
}): Promise<Plan> {
  const result: PlannerResult = await planGoal(params);
  params.send?.({ type: 'PLAN_READY', plan: { understanding: result.understanding, steps: result.steps, initialUrl: result.initialUrl, actions: result.actions } });
  if (params.send) emitBridgeEvent(params.send, 'plan_generated', { stepCount: result.actions.length });
  return {
    understanding: result.understanding,
    steps: result.steps,
    initialUrl: result.initialUrl,
    actions: result.actions
  };
}

export async function runPlannedTask(params: {
  goal: string;
  plan: Plan;
  tabId: number;
  apiKey: string;
  model: string;
  send: Send;
  signal: AbortSignal;
}): Promise<void> {
  const actions: AgentStep[] = (params.plan.actions ?? [])
    .map((item) => toAgentStep(item))
    .slice(0, 12);
  if (!actions.length) {
    params.send({ type: 'TASK_ERROR', error: 'Plan contains no executable actions.' });
    return;
  }

  await executePlan({
    goal: params.goal,
    actions,
    tabId: params.tabId,
    send: params.send,
    signal: params.signal,
    apiKey: params.apiKey,
    model: params.model
  });
}
