import { bestMatch, normalizeText } from './matcher';
import { isInteractive, isVisible } from './visibility';
import { finder } from '@medv/finder';

export type ResolveElementOptions = {
  query?: string;
  selector?: string;
  root?: ParentNode;
  retries?: number;
  retryDelayMs?: number;
  requireVisible?: boolean;
  interactiveOnly?: boolean;
  buttonOnly?: boolean;
  inputOnly?: boolean;
};

function elementText(element: Element): string {
  const htmlEl = element as HTMLElement;
  const ariaLabel = element.getAttribute('aria-label');
  const title = element.getAttribute('title');
  const placeholder = element.getAttribute('placeholder');
  const value = (htmlEl as HTMLInputElement).value;
  const labelTarget =
    htmlEl instanceof HTMLButtonElement ||
    htmlEl instanceof HTMLInputElement ||
    htmlEl instanceof HTMLMeterElement ||
    htmlEl instanceof HTMLOutputElement ||
    htmlEl instanceof HTMLProgressElement ||
    htmlEl instanceof HTMLSelectElement ||
    htmlEl instanceof HTMLTextAreaElement
      ? htmlEl
      : null;
  const label = labelTarget?.labels?.[0]?.textContent ?? '';

  return normalizeText([
    htmlEl.innerText,
    htmlEl.textContent,
    ariaLabel,
    title,
    placeholder,
    value,
    element.getAttribute('name'),
    element.getAttribute('id'),
    label
  ].filter(Boolean).join(' '));
}

function collectCandidates(root: ParentNode, options: ResolveElementOptions): Element[] {
  let selector = '*';

  if (options.buttonOnly) {
    selector = 'button, [role="button"], a, input[type="button"], input[type="submit"]';
  } else if (options.inputOnly) {
    selector = 'input, textarea, select, [contenteditable="true"], [role="textbox"]';
  } else if (options.interactiveOnly) {
    selector = 'button, a, input, textarea, select, [role="button"], [role="link"], [role="textbox"], [contenteditable="true"]';
  }

  const elements = Array.from(root.querySelectorAll(selector));
  return elements.filter((el) => (options.requireVisible === false ? true : isVisible(el)));
}

function queryBySelector(root: ParentNode, selector: string, requireVisible: boolean): Element | null {
  try {
    const matches = Array.from(root.querySelectorAll(selector));
    if (!matches.length) return null;
    return requireVisible ? matches.find((el) => isVisible(el)) ?? null : matches[0] ?? null;
  } catch {
    return null;
  }
}

function looksLikeSelector(query: string): boolean {
  const value = query.trim();
  if (!value) return false;
  return (
    /[#.[\]:>,+~]/.test(value) ||
    /^\*|^[a-z][a-z0-9_-]*(?:[#.[\]:]|$)/i.test(value)
  );
}

function queryByText(root: ParentNode, query: string, options: ResolveElementOptions): Element | null {
  const candidates = collectCandidates(root, options);
  const matched = bestMatch(query, candidates, elementText, 0.35);
  return matched?.item ?? null;
}

export async function retry<T>(fn: () => T | null | undefined, retries = 8, retryDelayMs = 200): Promise<T | null> {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const result = fn();
    if (result != null) return result;
    if (attempt < retries) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
  return null;
}

export async function resolveElement(options: ResolveElementOptions): Promise<Element | null> {
  const {
    query,
    selector,
    root = document,
    retries = 8,
    retryDelayMs = 200,
    requireVisible = true
  } = options;

  return retry(() => {
    if (query) {
      if (looksLikeSelector(query)) {
        const byQuerySelector = queryBySelector(root, query, requireVisible);
        if (byQuerySelector) return byQuerySelector;
      }
      const byQuery = queryByText(root, query, options);
      if (byQuery) return byQuery;
    }

    if (selector) {
      const bySelector = queryBySelector(root, selector, requireVisible);
      if (bySelector) return bySelector;
    }

    return null;
  }, retries, retryDelayMs);
}

export function ensureInView(element: Element): void {
  (element as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
}

export function extractElementSummary(element: Element): Record<string, unknown> {
  const htmlEl = element as HTMLElement;
  return {
    tag: element.tagName.toLowerCase(),
    role: element.getAttribute('role') ?? undefined,
    text: normalizeText(htmlEl.innerText || element.textContent || ''),
    id: element.getAttribute('id') ?? undefined,
    name: element.getAttribute('name') ?? undefined,
    placeholder: element.getAttribute('placeholder') ?? undefined,
    href: (htmlEl as HTMLAnchorElement).href ?? undefined,
    type: (htmlEl as HTMLInputElement).type ?? undefined
  };
}

export function selectorForElement(element: Element): string {
  const htmlEl = element as HTMLElement;
  if (htmlEl.id) return `#${CSS.escape(htmlEl.id)}`;
  try {
    return finder(htmlEl, { className: () => false });
  } catch {
    const tag = htmlEl.tagName.toLowerCase();
    return tag;
  }
}

export function getInteractiveElements(root: ParentNode = document): Element[] {
  const elements = Array.from(
    root.querySelectorAll('button, a, input, textarea, select, [role="button"], [role="link"], [role="textbox"], [contenteditable="true"]')
  );

  return elements.filter((el) => isVisible(el) && (isInteractive(el) || (el as HTMLElement).isContentEditable));
}
