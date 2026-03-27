import type { ToolResult } from '../../core/types';
import { extractElementSummary, resolveElement, selectorForElement } from '../../utils/dom';

type FindByTextArgs = {
  query: string;
};

export async function run(args: FindByTextArgs): Promise<ToolResult> {
  if (!args.query) return { success: false, error: 'Missing args.query' };

  const element = await resolveElement({
    query: args.query,
    retries: 8,
    retryDelayMs: 200,
    requireVisible: true
  });

  if (!element) return { success: false, error: `No element found for text query "${args.query}"` };

  return {
    success: true,
    data: {
      selector: selectorForElement(element),
      summary: extractElementSummary(element)
    }
  };
}
