import type { ToolResult } from '../../core/types';
import { getTrace, getTraceDetailed, getTraceState, getShortTermMemory } from '../../core/files';

export async function run(): Promise<ToolResult> {
  return {
    success: true,
    data: {
      compact: getTrace(),
      detailed: getTraceDetailed(),
      state: getTraceState(),
      shortTermMemory: getShortTermMemory()
    }
  };
}
