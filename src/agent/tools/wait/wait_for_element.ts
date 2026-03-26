import type { ToolResult } from '../../core/types';
import { resolveElement } from '../../utils/dom';

type WaitForElementArgs = {
  query?: string;
  selector?: string;
  timeoutMs?: number;
};

export async function run(args: WaitForElementArgs): Promise<ToolResult> {
  const timeoutMs = args.timeoutMs ?? 5000;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const found = await resolveElement({
      query: args.query,
      selector: args.selector,
      retries: 0,
      retryDelayMs: 0,
      requireVisible: true
    });

    if (found) return { success: true };
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  return { success: false, error: `Timeout waiting for query="${args.query ?? ''}" selector="${args.selector ?? ''}"` };
}
