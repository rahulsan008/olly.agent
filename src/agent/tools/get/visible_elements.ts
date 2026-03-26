import type { ToolResult } from '../../core/types';
import { extractElementSummary, getInteractiveElements } from '../../utils/dom';

export async function run(): Promise<ToolResult> {
  return {
    success: true,
    data: getInteractiveElements().map((el) => extractElementSummary(el))
  };
}
