import type { ToolResult } from '../../core/types';

type CopyArgs = {
  text: string;
};

export async function run(args: CopyArgs): Promise<ToolResult> {
  if (!args.text) return { success: false, error: 'Missing args.text' };

  try {
    await navigator.clipboard.writeText(args.text);
    return { success: true };
  } catch {
    return { success: false, error: 'Clipboard write failed' };
  }
}
