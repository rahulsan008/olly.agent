import type { ToolResult } from '../../core/types';

type PressKeyArgs = {
  key: string;
  code?: string;
};

export async function run(args: PressKeyArgs): Promise<ToolResult> {
  if (!args.key) return { success: false, error: 'Missing args.key' };

  const target = (document.activeElement as HTMLElement) ?? document.body;
  const base = {
    key: args.key,
    code: args.code ?? args.key,
    bubbles: true,
    cancelable: true
  };

  target.dispatchEvent(new KeyboardEvent('keydown', base));
  target.dispatchEvent(new KeyboardEvent('keypress', base));
  target.dispatchEvent(new KeyboardEvent('keyup', base));

  return { success: true };
}
