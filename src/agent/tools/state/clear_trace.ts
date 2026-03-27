import type { ToolResult } from '../../core/types';
import { clearTrace, clearShortTermMemory } from '../../core/files';

export async function run(): Promise<ToolResult> {
  clearTrace();
  clearShortTermMemory();
  return { success: true };
}
