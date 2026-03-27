import type { ToolResult } from '../../core/types';
import { extractElementSummary, selectorForElement } from '../../utils/dom';
import { isVisible } from '../../utils/visibility';

export async function run(): Promise<ToolResult> {
  const buttons = Array.from(document.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]'));

  return {
    success: true,
    data: buttons
      .filter((button) => isVisible(button))
      .map((button) => ({
        selector: selectorForElement(button),
        summary: extractElementSummary(button)
      }))
  };
}
