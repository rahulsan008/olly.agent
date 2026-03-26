import type { ToolResult } from '../../core/types';

export async function run(): Promise<ToolResult> {
  window.location.reload();
  return { success: true };
}
