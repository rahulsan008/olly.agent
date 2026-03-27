import type { ToolResult } from '../../core/types';
import { ensureInView } from '../../utils/dom';
import { isVisible } from '../../utils/visibility';

type OpenGridPostArgs = {
  index: number;
  href?: string;
};

function dispatchHumanClick(element: HTMLElement): void {
  const rect = element.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const base = { bubbles: true, cancelable: true, clientX: x, clientY: y };

  element.dispatchEvent(new MouseEvent('mouseover', base));
  element.dispatchEvent(new MouseEvent('mousedown', base));
  element.dispatchEvent(new MouseEvent('mouseup', base));
  element.dispatchEvent(new MouseEvent('click', base));
}

export async function run(args: OpenGridPostArgs): Promise<ToolResult> {
  const index = Number.isFinite(args.index) ? Math.max(0, Math.floor(args.index)) : 0;
  const anchors = Array.from(document.querySelectorAll('a[href]'))
    .filter((el): el is HTMLAnchorElement => el instanceof HTMLAnchorElement)
    .filter((el) => /\/(?:p|reel)\/[A-Za-z0-9_-]+\/?/.test(el.href));

  const deduped: HTMLAnchorElement[] = [];
  const seen = new Set<string>();
  for (const anchor of anchors) {
    const href = anchor.href.split('?')[0];
    if (seen.has(href)) continue;
    seen.add(href);
    deduped.push(anchor);
  }

  const normalizedHref = args.href?.split('?')[0];
  let target = normalizedHref
    ? deduped.find((anchor) => anchor.href.split('?')[0] === normalizedHref) ?? null
    : null;

  if (!target) {
    target = deduped[index] ?? null;
  }

  if (!target) {
    if (normalizedHref) {
      window.location.href = normalizedHref;
      return { success: true, data: { href: normalizedHref, mode: 'navigate' } };
    }
    return { success: false, error: `Instagram grid post at index ${index} not found` };
  }

  ensureInView(target);
  if (!isVisible(target)) {
    target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  await new Promise((resolve) => setTimeout(resolve, 150));
  dispatchHumanClick(target);

  return { success: true, data: { href: target.href, mode: 'click' } };
}
