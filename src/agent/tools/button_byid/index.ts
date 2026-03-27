import type { ToolResult } from '../../core/types';
import { extractElementSummary, queryFirstMatchingSelector, resolveElement, selectorForElement } from '../../utils/dom';

type ButtonByIdArgs = {
  selector?: string;
  id?: string;
  className?: string;
  name?: string;
  dataTestId?: string;
  text?: string;
  query?: string;
};

function escapeValue(value: string): string {
  return CSS.escape(value.trim());
}

function selectorsFromArgs(args: ButtonByIdArgs): string[] {
  const selectors: string[] = [];

  if (typeof args.selector === 'string' && args.selector.trim()) {
    selectors.push(args.selector.trim());
  }

  if (typeof args.id === 'string' && args.id.trim()) {
    const id = escapeValue(args.id);
    selectors.push(
      `button#${id}`,
      `[role="button"]#${id}`,
      `a#${id}`,
      `input[type="button"]#${id}`,
      `input[type="submit"]#${id}`,
      `#${id}`
    );
  }

  if (typeof args.dataTestId === 'string' && args.dataTestId.trim()) {
    const value = escapeValue(args.dataTestId);
    selectors.push(
      `button[data-testid="${value}"]`,
      `[role="button"][data-testid="${value}"]`,
      `a[data-testid="${value}"]`,
      `input[type="button"][data-testid="${value}"]`,
      `input[type="submit"][data-testid="${value}"]`,
      `[data-testid="${value}"]`
    );
  }

  if (typeof args.name === 'string' && args.name.trim()) {
    const value = escapeValue(args.name);
    selectors.push(
      `button[name="${value}"]`,
      `[role="button"][name="${value}"]`,
      `a[name="${value}"]`,
      `input[type="button"][name="${value}"]`,
      `input[type="submit"][name="${value}"]`
    );
  }

  if (typeof args.className === 'string' && args.className.trim()) {
    const classes = args.className
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => `.${escapeValue(part)}`)
      .join('');

    if (classes) {
      selectors.push(
        `button${classes}`,
        `[role="button"]${classes}`,
        `a${classes}`,
        `input[type="button"]${classes}`,
        `input[type="submit"]${classes}`
      );
    }
  }

  return selectors;
}

export async function run(args: ButtonByIdArgs): Promise<ToolResult> {
  const selectors = selectorsFromArgs(args);
  let element = selectors.length ? queryFirstMatchingSelector(document, selectors, true) : null;

  if (!element && typeof args.text === 'string' && args.text.trim()) {
    element = await resolveElement({
      query: args.text,
      buttonOnly: true,
      retries: 2,
      retryDelayMs: 100
    });
  }

  if (!element && typeof args.query === 'string' && args.query.trim()) {
    element = await resolveElement({
      query: args.query,
      buttonOnly: true,
      retries: 2,
      retryDelayMs: 100
    });
  }

  if (!element) return { success: false, error: 'Button not found' };

  return {
    success: true,
    data: {
      selector: selectorForElement(element),
      summary: extractElementSummary(element)
    }
  };
}
