import { Readability } from '@mozilla/readability';
import type { ToolResult } from '../../core/types';

type GetPageTextArgs = {
  includeTitle?: boolean;
};

export async function run(args: GetPageTextArgs = {}): Promise<ToolResult> {
  const cloned = document.cloneNode(true) as Document;
  const parsed = new Readability(cloned).parse();

  if (parsed?.textContent) {
    return {
      success: true,
      data: {
        title: args.includeTitle ? parsed.title : undefined,
        text: parsed.textContent.trim()
      }
    };
  }

  return {
    success: true,
    data: {
      title: args.includeTitle ? document.title : undefined,
      text: document.body.innerText.trim()
    }
  };
}
