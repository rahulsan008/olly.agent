import type { ToolResult } from '../../core/types';
import { isVisible } from '../../utils/visibility';

type GetElementTextArgs = {
  // CSS selector — defaults to 'article' (first visible post on feed-style pages)
  selector?: string;
  // If true, return text from ALL matching elements, not just the first
  all?: boolean;
};

type ElementTextData = {
  selector: string;
  count: number;
  items: {
    tag: string;
    text: string;
    ariaLabel?: string;
    alt?: string;        // img alt text inside the element
    username?: string;   // Instagram / social media username heuristic
  }[];
};

function extractFromElement(el: Element): ElementTextData['items'][number] {
  const html = el as HTMLElement;

  // Collect all text content, trimmed
  const text = (html.innerText ?? el.textContent ?? '').trim();

  // Alt text from any img inside (useful for posts with images)
  const imgs = Array.from(el.querySelectorAll('img[alt]'));
  const alt = imgs.map(i => i.getAttribute('alt')).filter(Boolean).join(' | ') || undefined;

  // Social-media username heuristic: <a href="/@foo"> or aria-label with "photo by"
  const userLink = el.querySelector('a[href^="/@"], a[href^="/"][href*="/"]') as HTMLAnchorElement | null;
  const username = userLink?.textContent?.trim() || userLink?.href?.split('/').filter(Boolean).pop() || undefined;

  return {
    tag: el.tagName.toLowerCase(),
    text: text.slice(0, 2000), // cap at 2000 chars per element
    ariaLabel: html.getAttribute('aria-label') ?? undefined,
    alt,
    username,
  };
}

export async function run(args: GetElementTextArgs = {}): Promise<ToolResult<ElementTextData>> {
  const selector = args.selector ?? 'article';

  let elements: Element[];
  try {
    elements = Array.from(document.querySelectorAll(selector)).filter(el => isVisible(el));
  } catch {
    return { success: false, error: `Invalid selector: ${selector}` };
  }

  if (elements.length === 0) {
    return { success: false, error: `No visible elements match: ${selector}` };
  }

  const targets = args.all ? elements : [elements[0]];

  return {
    success: true,
    data: {
      selector,
      count: elements.length,
      items: targets.map(extractFromElement),
    }
  };
}
