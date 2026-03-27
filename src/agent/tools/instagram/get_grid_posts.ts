import type { ToolResult } from '../../core/types';

export type GridPost = {
  index: number;
  href: string;
  shortcode: string | null;
  kind: 'post' | 'reel';
};

function getShortcodeFromHref(href: string): string | null {
  const match = href.match(/\/(?:p|reel)\/([A-Za-z0-9_-]+)\/?/);
  return match?.[1] ?? null;
}

export async function run(args: { limit?: number } = {}): Promise<ToolResult<GridPost[]>> {
  const limit = Math.max(1, args.limit ?? 20);
  const root = document.querySelector('main') ?? document;
  const anchors = Array.from(root.querySelectorAll('a[href]'))
    .filter((el): el is HTMLAnchorElement => el instanceof HTMLAnchorElement)
    .filter((el) => /\/(?:p|reel)\/[A-Za-z0-9_-]+\/?/.test(el.href));

  const deduped: GridPost[] = [];
  const seen = new Set<string>();

  for (const anchor of anchors) {
    const href = anchor.href.split('?')[0];
    if (seen.has(href)) continue;
    seen.add(href);
    deduped.push({
      index: deduped.length,
      href,
      shortcode: getShortcodeFromHref(href),
      kind: href.includes('/reel/') ? 'reel' : 'post',
    });
    if (deduped.length >= limit) break;
  }

  return { success: true, data: deduped };
}
