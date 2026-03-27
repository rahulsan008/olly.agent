import type { ToolResult } from '../../core/types';
import { callLlmTool } from '../llm/_call';

export async function run(args: Record<string, unknown>): Promise<ToolResult> {
  return callLlmTool('verify_task_completion', args);
}
