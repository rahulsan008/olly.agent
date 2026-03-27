import type { ToolResult } from '../../core/types';
import { extractElementSummary, selectorForElement } from '../../utils/dom';

type ClickCoordinatesArgs = {
  x: number;
  y: number;
};

function resolveClickableTarget(x: number, y: number): {
  rawTarget: HTMLElement | null;
  clickableTarget: HTMLElement | null;
} {
  const rawTarget = document.elementFromPoint(x, y) as HTMLElement | null;
  if (!rawTarget) {
    return { rawTarget: null, clickableTarget: null };
  }

  const clickableTarget = rawTarget.closest(
    'button, a, [role="button"], [role="link"], input[type="button"], input[type="submit"]'
  ) as HTMLElement | null;

  return { rawTarget, clickableTarget: clickableTarget ?? rawTarget };
}

function fireAtPoint(
  x: number,
  y: number
): {
  success: boolean;
  error?: string;
  targetTag?: string;
  clickedTag?: string;
  clickedElement?: HTMLElement;
} {
  const { rawTarget, clickableTarget } = resolveClickableTarget(x, y);
  if (!rawTarget) {
    return { success: false, error: `No element at (${x}, ${y})` };
  }
  if (!clickableTarget) {
    return { success: false, error: `No clickable element at (${x}, ${y})`, targetTag: rawTarget.tagName.toLowerCase() };
  }

  const init: MouseEventInit = {
    view: window,
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y
  };

  clickableTarget.dispatchEvent(new PointerEvent('pointerover', init));
  clickableTarget.dispatchEvent(new PointerEvent('pointerenter', { ...init, bubbles: false }));
  clickableTarget.dispatchEvent(new MouseEvent('mouseover', init));
  clickableTarget.dispatchEvent(new PointerEvent('pointerdown', init));
  clickableTarget.dispatchEvent(new MouseEvent('mousedown', init));
  clickableTarget.dispatchEvent(new PointerEvent('pointerup', init));
  clickableTarget.dispatchEvent(new MouseEvent('mouseup', init));
  clickableTarget.dispatchEvent(new MouseEvent('click', init));
  if (typeof clickableTarget.click === 'function') {
    clickableTarget.click();
  }

  return {
    success: true,
    targetTag: rawTarget.tagName.toLowerCase(),
    clickedTag: clickableTarget.tagName.toLowerCase(),
    clickedElement: clickableTarget
  };
}

export async function run(args: ClickCoordinatesArgs): Promise<ToolResult> {
  const x = typeof args.x === 'number' ? args.x : Number(args.x);
  const y = typeof args.y === 'number' ? args.y : Number(args.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return { success: false, error: 'x and y must be numbers' };
  }

  const result = fireAtPoint(x, y);
  if (!result.success) {
    return { success: false, error: result.error };
  }

  return {
    success: true,
    data: {
      coordinateSpace: 'viewport',
      x,
      y,
      targetTag: result.targetTag,
      clickedTag: result.clickedTag,
      selector: result.clickedElement ? selectorForElement(result.clickedElement) : undefined,
      summary: result.clickedElement ? extractElementSummary(result.clickedElement) : undefined
    }
  };
}
