import type { ToolResult } from '../../core/types';
import { extractElementSummary, resolveElement } from '../../utils/dom';

type FindInputArgs = {
  query: string;
  selector?: string;
};

export async function run(args: FindInputArgs): Promise<ToolResult> {
  const element = await resolveElement({
    query: args.query,
    selector: args.selector,
    inputOnly: true,
    retries: 10,
    retryDelayMs: 200
  });

  if (!element) return { success: false, error: 'Input not found' };

  return { success: true, data: { summary: extractElementSummary(element) } };
}
