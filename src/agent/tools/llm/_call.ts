import type { ToolResult } from '../../core/types';

export async function callLlmTool(
  llmTool: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const response = await chrome.runtime.sendMessage({
    type: 'RUN_LLM_TOOL',
    llmTool,
    args
  }) as { ok: boolean; result?: ToolResult; error?: string } | undefined;

  if (!response?.ok) {
    return { success: false, error: response?.error ?? `Failed to run ${llmTool}` };
  }
  return response.result ?? { success: false, error: `Empty result from ${llmTool}` };
}
