import type { ToolResult } from '../../core/types';
import { resolveElement } from '../../utils/dom';

type ScrollArgs = {
  query?: string;
  selector?: string;
  direction?: 'up' | 'down' | 'left' | 'right' | 'top' | 'bottom';
  amount?: number;
};

function getScrollableAncestor(element: HTMLElement): HTMLElement | null {
  let current: HTMLElement | null = element;
  while (current) {
    const style = window.getComputedStyle(current);
    const canScrollY = ['auto', 'scroll', 'overlay'].includes(style.overflowY) && current.scrollHeight > current.clientHeight;
    const canScrollX = ['auto', 'scroll', 'overlay'].includes(style.overflowX) && current.scrollWidth > current.clientWidth;
    if (canScrollY || canScrollX) return current;
    current = current.parentElement;
  }
  return null;
}

function applyScroll(target: { scrollBy: Function; scrollTo: Function; scrollTop?: number; scrollLeft?: number; scrollHeight?: number }, direction: ScrollArgs['direction'], amount: number): void {
  if (direction === 'top') target.scrollTo({ top: 0, behavior: 'smooth' });
  else if (direction === 'bottom') target.scrollTo({ top: target.scrollHeight ?? 0, behavior: 'smooth' });
  else if (direction === 'up') target.scrollBy({ top: -amount, behavior: 'smooth' });
  else if (direction === 'left') target.scrollBy({ left: -amount, behavior: 'smooth' });
  else if (direction === 'right') target.scrollBy({ left: amount, behavior: 'smooth' });
  else target.scrollBy({ top: amount, behavior: 'smooth' });
}

export async function run(args: ScrollArgs): Promise<ToolResult> {
  const amount = args.amount ?? 350;

  if (args.query || args.selector) {
    const element = await resolveElement({ query: args.query, selector: args.selector, requireVisible: true });
    if (!element) return { success: false, error: 'Element not found for scroll target' };

    const base = element as HTMLElement;
    const target = getScrollableAncestor(base) ?? (document.scrollingElement as HTMLElement | null);
    if (!target) return { success: false, error: 'No scrollable target found' };

    const before = { top: target.scrollTop, left: target.scrollLeft };
    applyScroll(target, args.direction, amount);
    await new Promise((resolve) => setTimeout(resolve, 220));
    const after = { top: target.scrollTop, left: target.scrollLeft };

    return { success: true, data: { before, after, moved: before.top !== after.top || before.left !== after.left } };
  }

  const root = document.scrollingElement as HTMLElement | null;
  if (!root) return { success: false, error: 'Document is not scrollable' };

  const before = { top: root.scrollTop, left: root.scrollLeft };
  applyScroll(root, args.direction, amount);
  await new Promise((resolve) => setTimeout(resolve, 220));
  const after = { top: root.scrollTop, left: root.scrollLeft };

  return { success: true, data: { before, after, moved: before.top !== after.top || before.left !== after.left } };
}
