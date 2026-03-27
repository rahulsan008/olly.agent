import type { ToolResult } from '../../core/types';
import { ensureInView, resolveElement } from '../../utils/dom';

function dispatchHumanClick(el: Element): void {
  const rect = el.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const base = { bubbles: true, cancelable: true, clientX: x, clientY: y };
  el.dispatchEvent(new MouseEvent('mouseover', base));
  el.dispatchEvent(new MouseEvent('mousedown', base));
  el.dispatchEvent(new MouseEvent('mouseup', base));
  el.dispatchEvent(new MouseEvent('click', base));
}

export async function run(): Promise<ToolResult> {
  const closeBtn = await resolveElement({
    selector: [
      'button[aria-label="Close"]',
      '[role="button"][aria-label="Close"]',
      'svg[aria-label="Close"]',
    ].join(', '),
    interactiveOnly: false,
    retries: 4,
    retryDelayMs: 150,
  });

  if (closeBtn) {
    const target = closeBtn instanceof SVGElement
      ? closeBtn.closest('button, [role="button"]') ?? closeBtn.parentElement ?? closeBtn
      : closeBtn;
    ensureInView(target);
    dispatchHumanClick(target);
    return { success: true, data: 'Closed Instagram post view' };
  }

  if (window.location.pathname !== '/' && !window.location.pathname.startsWith('/explore/tags/')) {
    window.history.back();
    return { success: true, data: 'Navigated back from Instagram post view' };
  }

  return { success: false, error: 'Instagram post close control not found' };
}
