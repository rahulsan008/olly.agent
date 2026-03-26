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

function getDelta(direction: ScrollArgs['direction'], amount: number): { top: number; left: number } {
  if (direction === 'up') return { top: -amount, left: 0 };
  if (direction === 'left') return { top: 0, left: -amount };
  if (direction === 'right') return { top: 0, left: amount };
  if (direction === 'top' || direction === 'bottom') return { top: 0, left: 0 };
  return { top: amount, left: 0 };
}

async function scrollAndMeasure(
  target: HTMLElement,
  direction: ScrollArgs['direction'],
  amount: number
): Promise<{ before: { top: number; left: number }; after: { top: number; left: number }; moved: boolean }> {
  const before = { top: target.scrollTop, left: target.scrollLeft };
  applyScroll(target, direction, amount);
  await new Promise((resolve) => setTimeout(resolve, 260));

  let after = { top: target.scrollTop, left: target.scrollLeft };
  let moved = before.top !== after.top || before.left !== after.left;

  // Some pages ignore smooth behavior; force via direct property update as fallback.
  if (!moved && direction !== 'top' && direction !== 'bottom') {
    const delta = getDelta(direction, amount);
    target.scrollTop += delta.top;
    target.scrollLeft += delta.left;
    await new Promise((resolve) => setTimeout(resolve, 60));
    after = { top: target.scrollTop, left: target.scrollLeft };
    moved = before.top !== after.top || before.left !== after.left;
  }

  return { before, after, moved };
}

export async function run(args: ScrollArgs): Promise<ToolResult> {
  const amount = args.amount ?? 350;

  if (args.query || args.selector) {
    const element = await resolveElement({ query: args.query, selector: args.selector, requireVisible: true });
    if (!element) return { success: false, error: 'Element not found for scroll target' };

    const base = element as HTMLElement;
    const target = getScrollableAncestor(base) ?? (document.scrollingElement as HTMLElement | null);
    if (!target) return { success: false, error: 'No scrollable target found' };

    const first = await scrollAndMeasure(target, args.direction, amount);
    if (first.moved) return { success: true, data: first };

    const root = document.scrollingElement as HTMLElement | null;
    if (root && root !== target) {
      const second = await scrollAndMeasure(root, args.direction, amount);
      if (second.moved) return { success: true, data: second };
      return {
        success: false,
        error: 'Scroll target and page root did not move',
        data: { target: first, root: second }
      };
    }

    return {
      success: false,
      error: 'Scrollable target did not move',
      data: first
    };
  }

  const root = document.scrollingElement as HTMLElement | null;
  if (!root) return { success: false, error: 'Document is not scrollable' };

  const result = await scrollAndMeasure(root, args.direction, amount);
  if (!result.moved) {
    window.scrollBy({ top: amount, behavior: 'auto' });
    await new Promise((resolve) => setTimeout(resolve, 60));
    const fallback = {
      before: result.before,
      after: { top: root.scrollTop, left: root.scrollLeft },
      moved: result.before.top !== root.scrollTop || result.before.left !== root.scrollLeft
    };
    if (!fallback.moved) {
      return { success: false, error: 'Page did not scroll', data: fallback };
    }
    return { success: true, data: fallback };
  }

  return { success: true, data: result };
}
