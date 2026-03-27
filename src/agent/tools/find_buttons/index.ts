import type { ToolResult } from '../../core/types';
import { extractElementSummary, getElementViewportRect, selectorForElement } from '../../utils/dom';
import { normalizeText } from '../../utils/matcher';
import { isVisible } from '../../utils/visibility';

type FindButtonsArgs = {
  query?: string;
  limit?: number;
};

function buttonText(element: Element): string {
  const htmlEl = element as HTMLElement;
  return normalizeText([
    htmlEl.innerText,
    element.textContent,
    element.getAttribute('aria-label'),
    element.getAttribute('title'),
    (htmlEl as HTMLInputElement).value
  ].filter(Boolean).join(' '));
}

export async function run(args: FindButtonsArgs): Promise<ToolResult> {
  const needle = typeof args.query === 'string' ? normalizeText(args.query) : '';
  const limit = typeof args.limit === 'number' ? Math.max(1, Math.min(args.limit, 50)) : 20;

  const buttons = Array.from(document.querySelectorAll(
    'button, [role="button"], input[type="button"], input[type="submit"]'
  ));

  const matches = buttons
    .filter((button) => isVisible(button))
    .filter((button) => {
      if (!needle) return true;
      const text = buttonText(button);
      if (!text) return false;
      return text.includes(needle) || needle.includes(text);
    })
    .slice(0, limit)
    .map((button) => ({
      selector: selectorForElement(button),
      summary: extractElementSummary(button),
      matchedText: buttonText(button),
      coordinates: getElementViewportRect(button)
    }));

  return {
    success: true,
    data: matches
  };
}
