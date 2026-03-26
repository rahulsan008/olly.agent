export function isVisible(element: Element): boolean {
  const htmlEl = element as HTMLElement;
  const rect = htmlEl.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;

  const style = window.getComputedStyle(htmlEl);
  if (style.display === 'none') return false;
  if (style.visibility === 'hidden') return false;
  if (style.opacity === '0') return false;

  return true;
}

export function isElementDisabled(element: Element): boolean {
  const htmlEl = element as HTMLElement & { disabled?: boolean };
  return htmlEl.hasAttribute('disabled') || htmlEl.getAttribute('aria-disabled') === 'true' || !!htmlEl.disabled;
}

export function isInteractive(element: Element): boolean {
  const tag = element.tagName.toLowerCase();
  const role = element.getAttribute('role')?.toLowerCase();

  if (['button', 'a', 'input', 'textarea', 'select'].includes(tag)) return true;
  if (role && ['button', 'link', 'textbox', 'checkbox', 'menuitem'].includes(role)) return true;
  if ((element as HTMLElement).onclick) return true;

  return false;
}
