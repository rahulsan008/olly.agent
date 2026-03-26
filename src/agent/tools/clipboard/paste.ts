import type { ToolResult } from '../../core/types';

type PasteArgs = {
  query?: string;
  selector?: string;
};

export async function run(_args: PasteArgs): Promise<ToolResult> {
  try {
    const text = await navigator.clipboard.readText();
    return { success: true, data: { text } };
  } catch {
    return { success: false, error: 'Clipboard read failed' };
  }
}
