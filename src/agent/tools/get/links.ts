import type { ToolResult } from '../../core/types';
import { extractElementSummary } from '../../utils/dom';
import { isVisible } from '../../utils/visibility';

export async function run(): Promise<ToolResult> {
  const links = Array.from(document.querySelectorAll('a[href], [role="link"]'));

  return {
    success: true,
    data: links
      .filter((link) => isVisible(link))
      .map((link) => extractElementSummary(link))
  };
}
