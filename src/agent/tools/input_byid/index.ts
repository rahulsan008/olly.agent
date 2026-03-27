import type { ToolResult } from '../../core/types';
import { extractElementSummary, queryFirstMatchingSelector, resolveElement, selectorForElement } from '../../utils/dom';

type InputByIdArgs = {
  selector?: string;
  id?: string;
  className?: string;
  name?: string;
  dataTestId?: string;
  placeholder?: string;
  query?: string;
};

function escapeValue(value: string): string {
  return CSS.escape(value.trim());
}

function selectorsFromArgs(args: InputByIdArgs): string[] {
  const selectors: string[] = [];

  if (typeof args.selector === 'string' && args.selector.trim()) {
    selectors.push(args.selector.trim());
  }

  if (typeof args.id === 'string' && args.id.trim()) {
    const id = escapeValue(args.id);
    selectors.push(
      `input#${id}`,
      `textarea#${id}`,
      `select#${id}`,
      `[role="textbox"]#${id}`,
      `#${id}`
    );
  }

  if (typeof args.dataTestId === 'string' && args.dataTestId.trim()) {
    const value = escapeValue(args.dataTestId);
    selectors.push(
      `input[data-testid="${value}"]`,
      `textarea[data-testid="${value}"]`,
      `select[data-testid="${value}"]`,
      `[role="textbox"][data-testid="${value}"]`,
      `[data-testid="${value}"]`
    );
  }

  if (typeof args.name === 'string' && args.name.trim()) {
    const value = escapeValue(args.name);
    selectors.push(
      `input[name="${value}"]`,
      `textarea[name="${value}"]`,
      `select[name="${value}"]`,
      `[role="textbox"][name="${value}"]`
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
        `input${classes}`,
        `textarea${classes}`,
        `select${classes}`,
        `[role="textbox"]${classes}`
      );
    }
  }

  if (typeof args.placeholder === 'string' && args.placeholder.trim()) {
    const value = escapeValue(args.placeholder);
    selectors.push(
      `input[placeholder="${value}"]`,
      `textarea[placeholder="${value}"]`
    );
  }

  return selectors;
}

export async function run(args: InputByIdArgs): Promise<ToolResult> {
  const selectors = selectorsFromArgs(args);
  let element = selectors.length ? queryFirstMatchingSelector(document, selectors, true) : null;

  if (!element && typeof args.query === 'string' && args.query.trim()) {
    element = await resolveElement({
      query: args.query,
      inputOnly: true,
      retries: 2,
      retryDelayMs: 100
    });
  }

  if (!element) return { success: false, error: 'Input not found' };

  return {
    success: true,
    data: {
      selector: selectorForElement(element),
      summary: extractElementSummary(element)
    }
  };
}
