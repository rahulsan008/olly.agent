import type { ToolResult } from '../../core/types';
import { extractElementSummary } from '../../utils/dom';
import { isVisible } from '../../utils/visibility';

export async function run(): Promise<ToolResult> {
  const inputs = Array.from(document.querySelectorAll('input, textarea, select, [contenteditable="true"]'));

  return {
    success: true,
    data: inputs
      .filter((input) => isVisible(input))
      .map((input) => extractElementSummary(input))
  };
}
