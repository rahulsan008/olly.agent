import type { ToolResult } from '../../core/types';
import { ensureInView, resolveElement } from '../../utils/dom';
import { isVisible } from '../../utils/visibility';

type LikePostArgs = {
  retries?: number;
};

// Instagram Like button selectors — tries button first, then SVG
const IG_LIKE_SELECTOR = [
  'button[aria-label="Like"]',
  'svg[aria-label="Like"]',
  'article button[aria-label*="Like"]',
].join(', ');

function getViewportArticle(): Element | null {
  let allArticles = Array.from(document.querySelectorAll('article'));
  if (allArticles.length === 0) {
    allArticles = Array.from(document.querySelectorAll('div[role="dialog"]'));
  }
  if (allArticles.length === 0) {
    allArticles = Array.from(document.querySelectorAll('main'));
  }
  const articles = allArticles.filter(el => isVisible(el));
  if (!articles.length) return null;
  const mid = window.innerHeight / 2;
  return articles.reduce((best, el) => {
    const rect = el.getBoundingClientRect();
    const dist = Math.abs(rect.top + rect.height / 2 - mid);
    const bestRect = best.getBoundingClientRect();
    const bestDist = Math.abs(bestRect.top + bestRect.height / 2 - mid);
    return dist < bestDist ? el : best;
  });
}

function dispatchHumanClick(el: HTMLElement): void {
  const rect = el.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const base = { bubbles: true, cancelable: true, clientX: x, clientY: y };
  el.dispatchEvent(new MouseEvent('mouseover',  base));
  el.dispatchEvent(new MouseEvent('mousedown',  base));
  el.dispatchEvent(new MouseEvent('mouseup',    base));
  el.click();
}

export async function run(args: LikePostArgs = {}): Promise<ToolResult> {
  const article = getViewportArticle();
  if (!article) {
    return { success: false, error: 'No visible Instagram post found' };
  }

  const element = await resolveElement({
    selector: IG_LIKE_SELECTOR,
    root: article,
    interactiveOnly: false,
    retries: args.retries ?? 8,
    retryDelayMs: 250,
  });

  if (!element) {
    return { success: false, error: 'Instagram Like button not found on page' };
  }

  // If we resolved an SVG, walk up to the nearest clickable ancestor
  let target = element as HTMLElement;
  if (element.tagName.toLowerCase() === 'svg') {
    const btn = element.closest('button, [role="button"]') ?? element.parentElement;
    if (btn) target = btn as HTMLElement;
  }

  // Guard: if the post is already liked the button says "Unlike" — skip to avoid un-liking
  const label = target.getAttribute('aria-label') ?? '';
  if (label.toLowerCase() === 'unlike') {
    return { success: true, data: 'Already liked — skipped' };
  }

  ensureInView(target);
  await new Promise(r => setTimeout(r, 120));
  dispatchHumanClick(target);

  return { success: true, data: 'Post liked' };
}
