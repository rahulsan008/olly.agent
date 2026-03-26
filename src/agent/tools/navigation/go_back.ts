import type { ToolResult } from '../../core/types';

export async function run(): Promise<ToolResult> {
  window.history.back();
  return { success: true };
}
