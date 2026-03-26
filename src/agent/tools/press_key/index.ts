import type { ToolResult } from '../../core/types';
import { ensureInView, resolveElement } from '../../utils/dom';

type PressKeyArgs = {
  key: string;
  code?: string;
  query?: string;
  selector?: string;
};

export async function run(args: PressKeyArgs): Promise<ToolResult> {
  if (!args.key) return { success: false, error: 'Missing args.key' };

  let target: HTMLElement | null = null;

  if (args.query || args.selector) {
    const resolved = await resolveElement({
      query: args.query,
      selector: args.selector,
      requireVisible: true,
      retries: 6,
      retryDelayMs: 150
    });
    target = resolved as HTMLElement | null;
  }

  if (!target) {
    target = (document.activeElement as HTMLElement) ?? document.body;
  }

  ensureInView(target);
  target.focus();

  const base = {
    key: args.key,
    code: args.code ?? args.key,
    bubbles: true,
    cancelable: true
  };

  const keydownOk = target.dispatchEvent(new KeyboardEvent('keydown', base));
  target.dispatchEvent(new KeyboardEvent('keypress', base));
  target.dispatchEvent(new KeyboardEvent('keyup', base));

  // Synthetic keyboard events are often not trusted by sites. For Enter, emulate
  // expected behavior with form submission/click fallback.
  let enterFallbackUsed = false;
  if (args.key === 'Enter') {
    const active = (document.activeElement as HTMLElement) ?? target;
    const form = active.closest('form') as HTMLFormElement | null;

    if (form) {
      enterFallbackUsed = true;
      if (typeof form.requestSubmit === 'function') {
        form.requestSubmit();
      } else {
        form.submit();
      }
    } else if ((active as HTMLInputElement).type === 'search' || active.tagName.toLowerCase() === 'input') {
      const nearbySubmit = active
        .closest('div, section, main, body')
        ?.querySelector('button[type="submit"], input[type="submit"], [role="button"]') as HTMLElement | null;
      if (nearbySubmit) {
        enterFallbackUsed = true;
        nearbySubmit.click();
      }
    }
  }

  return {
    success: keydownOk || enterFallbackUsed,
    data: {
      focusedTag: target.tagName.toLowerCase(),
      enterFallbackUsed
    },
    error: keydownOk || enterFallbackUsed ? undefined : 'Key event was canceled and no fallback was possible'
  };
}
