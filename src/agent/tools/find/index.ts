import type { ToolResult } from '../../core/types';
import { extractElementSummary, resolveElement } from '../../utils/dom';

type FindArgs = {
  query?: string;
  selector?: string;
  interactiveOnly?: boolean;
  buttonOnly?: boolean;
  inputOnly?: boolean;
};

export async function run(args: FindArgs): Promise<ToolResult> {
  const element = await resolveElement({
    query: args.query,
    selector: args.selector,
    interactiveOnly: args.interactiveOnly,
    buttonOnly: args.buttonOnly,
    inputOnly: args.inputOnly,
    retries: 8,
    retryDelayMs: 200
  });

  if (!element) return { success: false, error: 'No matching element found' };

  return {
    success: true,
    data: {
      summary: extractElementSummary(element)
    }
  };
}
