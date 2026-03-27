import type { ToolResult } from '../../core/types';
import { extractElementSummary, getInteractiveElements, selectorForElement } from '../../utils/dom';

export async function run(): Promise<ToolResult> {
  return {
    success: true,
    data: getInteractiveElements().map((el) => ({
      selector: selectorForElement(el),
      summary: extractElementSummary(el)
    }))
  };
}
