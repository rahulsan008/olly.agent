import type { ToolResult } from '../../core/types';
import { ensureInView, resolveElement } from '../../utils/dom';
import { isVisible } from '../../utils/visibility';

type CommentPostArgs = {
  text: string;
  retries?: number;
};

const IG_COMMENT_BTN = [
  'button[aria-label="Comment"]',
  'svg[aria-label="Comment"]',
].join(', ');

// Instagram uses div[role="textbox"] (contenteditable) in the current UI.
// Textarea selectors are kept as fallback for older/different layouts.
const IG_TEXTAREA = [
  'div[role="textbox"]',
  "textarea[aria-label='Add a comment\u2026']",
  "textarea[placeholder='Add a comment\u2026']",
  'textarea[aria-label*="comment"]',
  '[contenteditable="true"][aria-label*="comment"]',
].join(', ');

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns the article element whose center is closest to the viewport center. */
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
    const r = el.getBoundingClientRect();
    const d = Math.abs(r.top + r.height / 2 - mid);
    const bR = best.getBoundingClientRect();
    const bD = Math.abs(bR.top + bR.height / 2 - mid);
    return d < bD ? el : best;
  });
}

function dispatchHumanClick(el: Element): void {
  const rect = el.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const base = { bubbles: true, cancelable: true, clientX: x, clientY: y };
  el.dispatchEvent(new MouseEvent('mouseover', base));
  el.dispatchEvent(new MouseEvent('mousedown', base));
  el.dispatchEvent(new MouseEvent('mouseup',   base));
  // dispatchEvent works on SVGElement; .click() does not
  el.dispatchEvent(new MouseEvent('click',     base));
}

function typeIntoElement(el: HTMLElement, text: string): void {
  el.focus();
  if (el.isContentEditable) {
    // Clear then set via textContent — React reads from the DOM node directly.
    // Dispatch InputEvent so React's synthetic onChange fires.
    el.textContent = '';
    el.textContent = text;
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (el instanceof HTMLTextAreaElement) {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    if (setter) setter.call(el, text);
    else el.value = text;
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function run(args: CommentPostArgs): Promise<ToolResult> {
  if (!args.text?.trim()) {
    return { success: false, error: 'Missing args.text — comment text is required' };
  }

  // Scope all element lookups to the post currently centered in the viewport.
  // Without this, resolveElement picks the FIRST visible element on the page,
  // which is the previous post still in the DOM above the fold.
  const article = getViewportArticle();
  if (!article) return { success: false, error: 'No visible Instagram post found' };

  // Step 1: find and click the Comment button within the current article
  const commentBtn = await resolveElement({
    selector: IG_COMMENT_BTN,
    root: article,
    interactiveOnly: false,
    retries: args.retries ?? 8,
    retryDelayMs: 250,
  });
  if (!commentBtn) return { success: false, error: 'Comment button not found in current post' };

  let btnTarget = commentBtn;
  if (commentBtn instanceof SVGElement) {
    const btn = commentBtn.closest('button, [role="button"]') ?? commentBtn.parentElement;
    if (btn) btnTarget = btn;
  }
  ensureInView(btnTarget);
  dispatchHumanClick(btnTarget);

  // Step 2: wait for the textarea / contenteditable to appear.
  // Instagram renders the comment box via a React portal OUTSIDE the article,
  // so we must search the full document — not root: article.
  // Also avoid inputOnly: the filter excludes [role="textbox"] on some browsers.
  await new Promise(r => setTimeout(r, 1500));
  const textarea =
    // Primary: explicit selector, full document
    (await resolveElement({ selector: IG_TEXTAREA, retries: 15, retryDelayMs: 300 })) ??
    // Fallback: any focused/active input-like element Instagram may have opened
    (document.activeElement?.matches('textarea, [contenteditable], [role="textbox"]')
      ? document.activeElement as Element
      : null);
  if (!textarea) return { success: false, error: 'Comment textarea did not appear' };

  // Step 3: type the comment
  ensureInView(textarea);
  typeIntoElement(textarea as HTMLElement, args.text);
  await new Promise(r => setTimeout(r, 500));

  // Step 4: find the "Post" submit button — search inside the article first,
  // then fall back to the full document (Instagram renders it outside the article)
  const postBtn =
    (await resolveElement({ query: 'Post', buttonOnly: true, root: article,   retries: 6, retryDelayMs: 200 })) ??
    (await resolveElement({ query: 'Post', buttonOnly: true,                   retries: 4, retryDelayMs: 200 }));

  if (postBtn) {
    ensureInView(postBtn);
    dispatchHumanClick(postBtn);
    return { success: true, data: `Comment posted: "${args.text}"` };
  }

  // Fallback: press Enter on the textarea
  const ta = textarea as HTMLElement;
  ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
  ta.dispatchEvent(new KeyboardEvent('keyup',   { key: 'Enter', code: 'Enter', bubbles: true }));

  return { success: true, data: `Comment posted via Enter: "${args.text}"` };
}
