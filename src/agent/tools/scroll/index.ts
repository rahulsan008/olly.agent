import type { ToolResult } from '../../core/types';
import { resolveElement } from '../../utils/dom';

type ScrollArgs = {
  query?: string;
  selector?: string;
  direction?: 'up' | 'down' | 'left' | 'right' | 'top' | 'bottom';
  amount?: number;
};

export async function run(args: ScrollArgs): Promise<ToolResult> {
  const amount = args.amount ?? 350;

  if (args.query || args.selector) {
    const element = await resolveElement({ query: args.query, selector: args.selector, requireVisible: true });
    if (!element) return { success: false, error: 'Element not found for scroll target' };

    const target = element as HTMLElement;
    if (args.direction === 'top') target.scrollTo({ top: 0, behavior: 'smooth' });
    else if (args.direction === 'bottom') target.scrollTo({ top: target.scrollHeight, behavior: 'smooth' });
    else if (args.direction === 'up') target.scrollBy({ top: -amount, behavior: 'smooth' });
    else if (args.direction === 'down' || !args.direction) target.scrollBy({ top: amount, behavior: 'smooth' });
    else if (args.direction === 'left') target.scrollBy({ left: -amount, behavior: 'smooth' });
    else if (args.direction === 'right') target.scrollBy({ left: amount, behavior: 'smooth' });

    return { success: true };
  }

  if (args.direction === 'top') window.scrollTo({ top: 0, behavior: 'smooth' });
  else if (args.direction === 'bottom') window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  else if (args.direction === 'up') window.scrollBy({ top: -amount, behavior: 'smooth' });
  else if (args.direction === 'left') window.scrollBy({ left: -amount, behavior: 'smooth' });
  else if (args.direction === 'right') window.scrollBy({ left: amount, behavior: 'smooth' });
  else window.scrollBy({ top: amount, behavior: 'smooth' });

  return { success: true };
}
