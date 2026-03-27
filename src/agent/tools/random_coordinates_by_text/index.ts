import type { ToolResult } from '../../core/types';
import { getElementViewportRect, selectorForElement, extractElementSummary } from '../../utils/dom';
import { normalizeText } from '../../utils/matcher';
import { isVisible } from '../../utils/visibility';

type RandomCoordinatesByTextArgs = {
  text: string;
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

export async function run(args: RandomCoordinatesByTextArgs): Promise<ToolResult> {
  const needle = normalizeText(args.text ?? '');
  if (!needle) {
    return { success: false, error: 'Missing args.text' };
  }

  const buttons = Array.from(document.querySelectorAll(
    'button, [role="button"], input[type="button"], input[type="submit"]'
  ));

  const matches = buttons
    .filter((button) => isVisible(button))
    .filter((button) => {
      const text = buttonText(button);
      if (!text) return false;
      return text.includes(needle) || needle.includes(text);
    });

  if (!matches.length) {
    return { success: false, error: `No visible button found for text="${args.text}"` };
  }

  const randomButton = matches[Math.floor(Math.random() * matches.length)];

  return {
    success: true,
    data: {
      selector: selectorForElement(randomButton),
      summary: extractElementSummary(randomButton),
      matchedText: buttonText(randomButton),
      coordinates: getElementViewportRect(randomButton)
    }
  };
}
