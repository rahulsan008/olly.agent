let overlay: HTMLElement | null = null;
let removeTimer: ReturnType<typeof setTimeout> | null = null;

export function highlightElement(selector: string): void {
  // Clean up previous
  if (overlay) { overlay.remove(); overlay = null; }
  if (removeTimer) { clearTimeout(removeTimer); removeTimer = null; }

  const target = document.querySelector(selector);
  if (!target) return;

  const rect = target.getBoundingClientRect();

  const el = document.createElement('div');
  el.style.cssText = `
    position: fixed;
    top: ${rect.top}px;
    left: ${rect.left}px;
    width: ${rect.width}px;
    height: ${rect.height}px;
    border: 2px solid #6366f1;
    background: rgba(99,102,241,0.15);
    border-radius: 4px;
    z-index: 2147483647;
    pointer-events: none;
    box-shadow: 0 0 0 4px rgba(99,102,241,0.2);
    transition: opacity 0.3s ease;
  `;
  document.body.appendChild(el);
  overlay = el;

  removeTimer = setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => { el.remove(); if (overlay === el) overlay = null; }, 300);
  }, 1800);
}
