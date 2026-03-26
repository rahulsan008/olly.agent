import type { ToolResult } from '../../core/types';

type WaitForTextArgs = {
  text: string;
  timeoutMs?: number;
};

export async function run(args: WaitForTextArgs): Promise<ToolResult> {
  if (!args.text) return { success: false, error: 'Missing args.text' };

  const timeoutMs = args.timeoutMs ?? 5000;
  const needle = args.text.toLowerCase();
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const bodyText = document.body?.innerText?.toLowerCase() ?? '';
    if (bodyText.includes(needle)) return { success: true };
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  return { success: false, error: `Timeout waiting for text "${args.text}"` };
}
