import type { ToolResult } from '../../core/types';
import { startTrace, updateShortTermMemory } from '../../core/files';

type StartTraceArgs = {
  goal?: string;
};

export async function run(args: StartTraceArgs = {}): Promise<ToolResult> {
  startTrace(args.goal ?? '');
  if (args.goal?.trim()) {
    updateShortTermMemory({ goal: args.goal.trim(), currentStep: 0, lastAction: 'start_trace', lastSuccess: true });
  }

  return {
    success: true,
    data: {
      startedAt: Date.now(),
      goal: args.goal ?? ''
    }
  };
}
