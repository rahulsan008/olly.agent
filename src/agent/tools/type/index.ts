import type { ToolResult } from '../../core/types';
import { ensureInView, resolveElement, selectorForElement } from '../../utils/dom';

type TypeArgs = {
  query?: string;
  selector?: string;
  text: string;
  clearFirst?: boolean;
};

function setInputValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

  if (setter) {
    setter.call(element, value);
  } else {
    element.value = value;
  }

  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

export async function run(args: TypeArgs): Promise<ToolResult> {
  if (!args.text) return { success: false, error: 'Missing args.text' };

  let element = await resolveElement({
    query: args.query,
    selector: args.selector,
    inputOnly: true,
    retries: 10,
    retryDelayMs: 200
  });

  if (!element) {
    const active = document.activeElement as HTMLElement | null;
    if (
      active &&
      (
        active.isContentEditable ||
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement
      )
    ) {
      element = active;
    }
  }

  if (!element) {
    return { success: false, error: `Could not find input for query="${args.query ?? ''}"` };
  }

  ensureInView(element);
  const htmlEl = element as HTMLElement;
  htmlEl.focus();

  const clearFirst = args.clearFirst ?? true;

  if (htmlEl.isContentEditable) {
    if (clearFirst) htmlEl.textContent = '';
    htmlEl.textContent = `${htmlEl.textContent ?? ''}${args.text}`;
    htmlEl.dispatchEvent(new InputEvent('input', { bubbles: true, data: args.text, inputType: 'insertText' }));
    htmlEl.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (htmlEl instanceof HTMLInputElement || htmlEl instanceof HTMLTextAreaElement) {
    const value = clearFirst ? args.text : `${htmlEl.value}${args.text}`;
    setInputValue(htmlEl, value);
  } else {
    return { success: false, error: 'Resolved element is not a typable input' };
  }

  return { success: true, data: { selector: selectorForElement(element) } };
}
