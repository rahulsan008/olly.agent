import type { ToolResult } from '../../core/types';
import { callLlmTool } from '../llm/_call';

export async function run(args: Record<string, unknown>): Promise<ToolResult> {
  return callLlmTool('generate_search_query', args);
}
