import { finder } from '@medv/finder';
import type { ToolResult } from '../../core/types';
import { resolveElement } from '../../utils/dom';

type GenerateSelectorArgs = {
  query?: string;
  selector?: string;
};

export async function run(args: GenerateSelectorArgs): Promise<ToolResult> {
  const element = await resolveElement({
    query: args.query,
    selector: args.selector,
    retries: 8,
    retryDelayMs: 200,
    requireVisible: false
  });

  if (!element) return { success: false, error: 'No element found to generate selector' };

  try {
    const stableSelector = finder(element as HTMLElement);
    return { success: true, data: { selector: stableSelector } };
  } catch {
    return { success: false, error: 'Failed to generate stable selector' };
  }
}
