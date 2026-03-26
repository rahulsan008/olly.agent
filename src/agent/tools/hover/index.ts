import type { ToolResult } from '../../core/types';
import { ensureInView, resolveElement } from '../../utils/dom';

type HoverArgs = {
  query?: string;
  selector?: string;
};

export async function run(args: HoverArgs): Promise<ToolResult> {
  const element = await resolveElement({
    query: args.query,
    selector: args.selector,
    retries: 8,
    retryDelayMs: 200,
    requireVisible: true
  });

  if (!element) return { success: false, error: 'Element not found for hover' };

  ensureInView(element);
  const rect = (element as HTMLElement).getBoundingClientRect();
  const base = {
    bubbles: true,
    cancelable: true,
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2
  };

  element.dispatchEvent(new MouseEvent('mouseover', base));
  element.dispatchEvent(new MouseEvent('mouseenter', { ...base, bubbles: false }));
  element.dispatchEvent(new MouseEvent('mousemove', base));

  return { success: true };
}
