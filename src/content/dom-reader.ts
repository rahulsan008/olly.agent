import type { PageSnapshot, InteractiveElement } from '../shared/types';

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

function getSelector(el: Element): string {
  if (el.id) return `#${el.id}`;
  const parts: string[] = [];
  let cur: Element | null = el;
  while (cur && cur !== document.body) {
    let part = cur.tagName.toLowerCase();
    if (cur.id) { parts.unshift(`#${cur.id}`); break; }
    const classes = Array.from(cur.classList)
      .filter(c => /^[a-z]/i.test(c) && !c.includes(':'))
      .slice(0, 2).join('.');
    if (classes) part += `.${classes}`;
    const parent = cur.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(s => s.tagName === cur!.tagName);
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(cur) + 1})`;
    }
    parts.unshift(part);
    cur = cur.parentElement;
  }
  return parts.join(' > ');
}

function truncate(text: string, max = 80): string {
  const t = text.trim();
  return t.length > max ? t.slice(0, max) + '…' : t;
}

export function getPageSnapshot(): PageSnapshot {
  const elements: InteractiveElement[] = [];

  document.querySelectorAll('button, [role="button"]').forEach(el => {
    if (!isVisible(el)) return;
    elements.push({ type: 'button', selector: getSelector(el), text: truncate(el.textContent || '') });
  });

  document.querySelectorAll('input:not([type="hidden"]), textarea').forEach(el => {
    if (!isVisible(el)) return;
    const inp = el as HTMLInputElement;
    elements.push({
      type: inp.tagName === 'TEXTAREA' ? 'textarea' : 'input',
      selector: getSelector(el),
      placeholder: inp.placeholder || undefined,
      value: inp.value || undefined
    });
  });

  document.querySelectorAll('a[href]').forEach(el => {
    if (!isVisible(el)) return;
    const a = el as HTMLAnchorElement;
    elements.push({ type: 'link', selector: getSelector(el), text: truncate(el.textContent || ''), href: a.href });
  });

  document.querySelectorAll('select').forEach(el => {
    if (!isVisible(el)) return;
    elements.push({ type: 'select', selector: getSelector(el), value: (el as HTMLSelectElement).value });
  });

  return {
    url: window.location.href,
    title: document.title,
    content: document.body.innerText.replace(/\s+/g, ' ').slice(0, 3000),
    interactiveElements: elements.slice(0, 60)
  };
}
