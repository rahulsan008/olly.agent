import type { ToolResult } from '../../core/types';
import { resolveElement, selectorForElement } from '../../utils/dom';

type ExtractArgs = {
  query?: string;
  selector?: string;
};

export async function run(args: ExtractArgs): Promise<ToolResult> {
  const element = await resolveElement({
    query: args.query,
    selector: args.selector,
    retries: 8,
    retryDelayMs: 180
  });

  if (!element) return { success: false, error: 'No matching element found for extract' };
  const htmlEl = element as HTMLElement;

  return {
    success: true,
    data: {
      selector: selectorForElement(element),
      text: (htmlEl.innerText || element.textContent || '').trim()
    }
  };
}
