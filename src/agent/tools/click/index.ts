import type { ToolResult } from '../../core/types';
import { ensureInView, resolveElement, selectorForElement } from '../../utils/dom';

type ClickArgs = {
  query?: string;
  selector?: string;
  retries?: number;
};

function dispatchHumanClick(element: HTMLElement): void {
  const rect = element.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const base = { bubbles: true, cancelable: true, clientX: x, clientY: y };

  element.dispatchEvent(new MouseEvent('mouseover', base));
  element.dispatchEvent(new MouseEvent('mousedown', base));
  element.dispatchEvent(new MouseEvent('mouseup', base));
  element.click();
}

export async function run(args: ClickArgs): Promise<ToolResult> {
  const element = await resolveElement({
    query: args.query,
    selector: args.selector,
    interactiveOnly: true,
    retries: args.retries ?? 10,
    retryDelayMs: 200
  });

  if (!element) {
    return { success: false, error: `Could not find clickable element for query="${args.query ?? ''}"` };
  }

  ensureInView(element);
  await new Promise((resolve) => setTimeout(resolve, 120));
  dispatchHumanClick(element as HTMLElement);

  return { success: true, data: { selector: selectorForElement(element) } };
}
