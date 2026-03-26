import type { ToolResult } from '../../core/types';

export async function run(): Promise<ToolResult> {
  const text = window.getSelection()?.toString() ?? '';
  return { success: true, data: { text } };
}
