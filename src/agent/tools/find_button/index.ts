import type { ToolResult } from '../../core/types';
import { extractElementSummary, resolveElement, selectorForElement } from '../../utils/dom';

type FindButtonArgs = {
  query: string;
  selector?: string;
};

export async function run(args: FindButtonArgs): Promise<ToolResult> {
  const element = await resolveElement({
    query: args.query,
    selector: args.selector,
    buttonOnly: true,
    retries: 10,
    retryDelayMs: 200
  });

  if (!element) return { success: false, error: 'Button not found' };

  return {
    success: true,
    data: {
      selector: selectorForElement(element),
      summary: extractElementSummary(element)
    }
  };
}
