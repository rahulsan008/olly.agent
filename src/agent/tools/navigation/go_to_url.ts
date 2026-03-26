import type { ToolResult } from '../../core/types';

type GoToUrlArgs = {
  url: string;
};

export async function run(args: GoToUrlArgs): Promise<ToolResult> {
  if (!args.url) return { success: false, error: 'Missing args.url' };

  try {
    const normalized = new URL(args.url, window.location.href).toString();
    window.location.href = normalized;
    return { success: true, data: { url: normalized } };
  } catch {
    return { success: false, error: `Invalid URL: ${args.url}` };
  }
}
