import type { AgenticToolName } from '../../shared/agent_tools';

export type BridgeEventName =
  | 'plan_generated'
  | 'step_started'
  | 'step_success'
  | 'step_failed'
  | 'task_complete';

export type AgentToolName = AgenticToolName;

export interface AgentStepCheck {
  tool: AgentToolName;
  args: Record<string, unknown>;
}

export interface AgentStep {
  tool: AgentToolName;
  args: Record<string, unknown>;
  why?: string;
  check?: AgentStepCheck;
  alternates?: Array<{
    tool: AgentToolName;
    args: Record<string, unknown>;
    why?: string;
  }>;
}

export interface PlannerResult {
  understanding: string;
  steps: string[];
  actions: AgentStep[];
  initialUrl: string | null;
}
