// ── Visibility ───────────────────────────────────────────────────────────────

function isVisible(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  const style = window.getComputedStyle(el);
  return (
    rect.width > 0 && rect.height > 0 &&
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.opacity !== '0'
  );
}

// ── Text-based element finder (fallback for dynamic UIs) ─────────────────────

function findByText(query: string): HTMLElement | null {
  const needle = query.toLowerCase().trim();
  const candidates = Array.from(document.querySelectorAll(
    'a, button, [role="button"], [role="link"], input[type="submit"], input[type="button"], [contenteditable="true"]'
  ));
  // exact match first
  for (const el of candidates) {
    if (!isVisible(el)) continue;
    const text = normalizeText(el);
    if (text === needle) return el as HTMLElement;
  }
  // partial match
  for (const el of candidates) {
    if (!isVisible(el)) continue;
    const text = normalizeText(el);
    if (text && (text.includes(needle) || needle.includes(text))) return el as HTMLElement;
  }
  return null;
}

function findInputByHint(query: string): HTMLElement | null {
  const needle = query.toLowerCase().trim();
  const candidates = Array.from(document.querySelectorAll('input, textarea, [contenteditable="true"]'));
  for (const el of candidates) {
    if (!isVisible(el)) continue;
    const hint = (
      (el as HTMLInputElement).placeholder ||
      el.getAttribute('aria-label') ||
      el.getAttribute('name') ||
      el.getAttribute('id') || ''
    ).toLowerCase();
    if (hint && hint.includes(needle)) return el as HTMLElement;
  }
  return null;
}

function normalizeText(el: Element): string {
  return (
    el.textContent ||
    el.getAttribute('aria-label') ||
    el.getAttribute('title') ||
    (el as HTMLInputElement).value ||
    el.getAttribute('placeholder') || ''
  ).toLowerCase().trim();
}

// ── Actions ──────────────────────────────────────────────────────────────────

function fireClick(el: HTMLElement): void {
  const rect = el.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const opts = { bubbles: true, cancelable: true, clientX: cx, clientY: cy };

  el.dispatchEvent(new PointerEvent('pointerover',  opts));
  el.dispatchEvent(new PointerEvent('pointerenter', { ...opts, bubbles: false }));
  el.dispatchEvent(new MouseEvent('mouseover',      opts));
  el.dispatchEvent(new PointerEvent('pointermove',  opts));
  el.dispatchEvent(new MouseEvent('mousemove',      opts));
  el.dispatchEvent(new PointerEvent('pointerdown',  opts));
  el.dispatchEvent(new MouseEvent('mousedown',      opts));
  el.dispatchEvent(new PointerEvent('pointerup',    opts));
  el.dispatchEvent(new MouseEvent('mouseup',        opts));
  el.click();
  el.dispatchEvent(new MouseEvent('mouseout',       opts));
}

export async function clickAtCoordinates(
  x: number,
  y: number
): Promise<{ success: boolean; error?: string }> {
  // Screenshots are captured at devicePixelRatio scale — normalize to CSS pixels
  const dpr = window.devicePixelRatio || 1;
  const cssX = x / dpr;
  const cssY = y / dpr;
  const el = document.elementFromPoint(cssX, cssY) as HTMLElement | null;
  if (!el) return { success: false, error: `No element at (${cssX}, ${cssY})` };
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  await new Promise(r => setTimeout(r, 150));
  el.focus();
  fireClick(el);
  return { success: true };
}

export async function clickElement(
  selector: string
): Promise<{ success: boolean; error?: string }> {
  // 1. Try CSS selector — pick first visible match
  let el: HTMLElement | null = null;
  try {
    const all = Array.from(document.querySelectorAll(selector)) as HTMLElement[];
    el = all.find(e => isVisible(e)) ?? null;
    // If matched an SVG/icon, walk up to nearest clickable ancestor
    if (el && (el.tagName === 'svg' || el.tagName === 'SVG')) {
      const btn = el.closest('button, [role="button"]') as HTMLElement | null;
      if (btn) el = btn;
    }
  } catch {
    // invalid selector — fall through to text search
  }

  // 2. Text-based fallback — treat selector as a text hint
  if (!el) el = findByText(selector);

  if (!el) return { success: false, error: `Element not found: ${selector}` };

  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await new Promise(r => setTimeout(r, 200));
  el.focus();
  fireClick(el);
  return { success: true };
}

export async function pressKey(
  key: string
): Promise<{ success: boolean }> {
  const target = (document.activeElement as HTMLElement) ?? document.body;
  const opts = { key, code: key, bubbles: true, cancelable: true };
  target.dispatchEvent(new KeyboardEvent('keydown',  opts));
  target.dispatchEvent(new KeyboardEvent('keypress', opts));
  target.dispatchEvent(new KeyboardEvent('keyup',    opts));
  await new Promise(r => setTimeout(r, 300));
  return { success: true };
}

export async function typeText(
  selector: string,
  text: string,
  clearFirst = true
): Promise<{ success: boolean; error?: string }> {
  // 1. CSS selector (visible only) — support comma-separated selectors
  let el: HTMLElement | null = null;
  try {
    const all = Array.from(document.querySelectorAll(selector)) as HTMLElement[];
    el = all.find(e => isVisible(e)) ?? null;
  } catch { /* invalid selector */ }
  if (!el) el = null;

  // 2. Also check contenteditable via CSS
  if (!el) {
    try {
      const ce = document.querySelector(`${selector}[contenteditable]`) as HTMLElement | null;
      if (ce && isVisible(ce)) el = ce;
    } catch { /* ignore */ }
  }

  // 3. Text/hint fallback (inputs + contenteditable)
  if (!el) el = findInputByHint(selector);

  // 4. Fallback: any visible contenteditable that's focused/active
  if (!el) {
    const ces = Array.from(document.querySelectorAll('[contenteditable="true"], [contenteditable=""]'));
    el = (ces.find(e => isVisible(e)) as HTMLElement | undefined) ?? null;
  }

  if (!el) return { success: false, error: `Input not found: ${selector}` };

  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await new Promise(r => setTimeout(r, 150));
  el.focus();
  await new Promise(r => setTimeout(r, 80));

  const isContentEditable = el.isContentEditable || el.getAttribute('contenteditable') !== null;

  if (isContentEditable) {
    // ── contenteditable (Instagram, Twitter comment boxes etc.) ──
    // execCommand('insertText') is the ONLY technique that fires React's
    // native input event on contenteditable divs reliably.
    if (clearFirst) {
      document.execCommand('selectAll', false);
      document.execCommand('delete', false);
    }
    document.execCommand('insertText', false, text);

  } else {
    // ── Regular <input> / <textarea> in React apps ──
    // Setting .value directly is ignored by React because React stores its
    // own internal value. We must use the native prototype setter so React's
    // change detection fires on the subsequent 'input' event.
    const proto = el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;

    if (nativeSetter) {
      const inp = el as HTMLInputElement;
      nativeSetter.call(inp, clearFirst ? text : inp.value + text);
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      // Last resort: execCommand on focused input
      if (clearFirst) { document.execCommand('selectAll', false); document.execCommand('delete', false); }
      document.execCommand('insertText', false, text);
    }
  }

  await new Promise(r => setTimeout(r, 50));
  return { success: true };
}

export async function scrollPage(
  direction: string,
  amount = 300
): Promise<{ success: boolean }> {
  switch (direction) {
    case 'up':     window.scrollBy({ top: -amount, behavior: 'smooth' }); break;
    case 'down':   window.scrollBy({ top: amount,  behavior: 'smooth' }); break;
    case 'top':    window.scrollTo({ top: 0, behavior: 'smooth' }); break;
    case 'bottom': window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); break;
  }
  await new Promise(r => setTimeout(r, 400));
  return { success: true };
}

export function extractData(
  selector: string
): { success: boolean; data?: string; error?: string } {
  const els = document.querySelectorAll(selector);
  if (!els.length) return { success: false, error: `No elements match: ${selector}` };
  const data = Array.from(els).map(el => el.textContent?.trim()).filter(Boolean).join('\n');
  return { success: true, data };
}

export async function submitComment(): Promise<{ success: boolean; error?: string }> {
  // Strategy 1: find a visible "Post" button inside the active element's form
  const active = document.activeElement as HTMLElement | null;
  const form = active?.closest('form');
  if (form) {
    const btns = Array.from(form.querySelectorAll('button, [role="button"]')) as HTMLElement[];
    for (const btn of btns) {
      if (!isVisible(btn)) continue;
      const label = (btn.textContent || btn.getAttribute('aria-label') || '').toLowerCase().trim();
      if (label === 'post' || label.includes('post')) {
        fireClick(btn);
        await new Promise(r => setTimeout(r, 200));
        return { success: true };
      }
    }
    // Fall back to any non-disabled visible button in the form
    for (const btn of btns) {
      if (isVisible(btn) && !(btn as HTMLButtonElement).disabled) {
        fireClick(btn);
        await new Promise(r => setTimeout(r, 200));
        return { success: true };
      }
    }
  }
  // Strategy 2: global text search
  const postBtn = findByText('post');
  if (postBtn) {
    fireClick(postBtn);
    await new Promise(r => setTimeout(r, 200));
    return { success: true };
  }
  return { success: false, error: 'Post button not found' };
}

export async function waitForElement(
  selector: string,
  timeout = 5000
): Promise<{ success: boolean; error?: string }> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (document.querySelector(selector)) return { success: true };
    await new Promise(r => setTimeout(r, 150));
  }
  return { success: false, error: `Timeout waiting for: ${selector}` };
}
