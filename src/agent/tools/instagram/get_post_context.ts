import type { ToolResult } from '../../core/types';
import { isVisible } from '../../utils/visibility';

export type PostContext = {
  shortcode: string | null;  // unique post ID extracted from /p/SHORTCODE/ anchor
  caption: string;
  username: string;
  hashtags: string[];
  altText: string;
  articleText: string;
};

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function isLikelyUiText(text: string): boolean {
  const normalized = text.toLowerCase();
  return [
    'like',
    'comment',
    'share',
    'follow',
    'message',
    'more',
    'view all',
    'reply',
  ].some(token => normalized === token || normalized.startsWith(`${token} `));
}

export async function run(): Promise<ToolResult<PostContext>> {
  let allArticles = Array.from(document.querySelectorAll('article'));
  if (allArticles.length === 0) {
    const dialogs = Array.from(document.querySelectorAll('div[role="dialog"]'));
    const mains = Array.from(document.querySelectorAll('main'));
    if (dialogs.length) allArticles = dialogs as HTMLElement[];
    else if (mains.length) allArticles = mains as HTMLElement[];
    else allArticles = [document.body];
  }
  
  const visibleArticles = allArticles.filter(el => isVisible(el));
  const articles = visibleArticles.length ? visibleArticles : allArticles;

  if (!articles.length) {
    return { success: false, error: 'No visible Instagram post found' };
  }

  // Pick the article whose vertical center is closest to the viewport center.
  // articles[0] is wrong after scrolling because old posts stay in the DOM above the fold.
  const viewportMid = window.innerHeight / 2;
  const article = articles.reduce((best, el) => {
    const r = el.getBoundingClientRect();
    const dist = Math.abs(r.top + r.height / 2 - viewportMid);
    const bestR = best.getBoundingClientRect();
    const bestDist = Math.abs(bestR.top + bestR.height / 2 - viewportMid);
    return dist < bestDist ? el : best;
  });

  // Unique post shortcode from /p/SHORTCODE/ or /reel/SHORTCODE/ permalink anchor
  const postLink = article.querySelector('a[href*="/p/"], a[href*="/reel/"]') as HTMLAnchorElement | null;
  const shortcodeMatch = (postLink?.href || window.location.href)?.match(/\/(?:p|reel)\/([A-Za-z0-9_-]+)\/?/);
  const shortcode = shortcodeMatch?.[1] ?? null;

  const articleText = normalizeText((article as HTMLElement).innerText || article.textContent).slice(0, 2000);

  // Caption: prefer the longest meaningful text block inside the article.
  const captionCandidates = Array.from(
    article.querySelectorAll('h1, h2, [class*="caption"], [role="presentation"] span, span, div, p')
  )
    .map(el => normalizeText((el as HTMLElement).innerText || el.textContent))
    .filter(text => text.length >= 12 && !isLikelyUiText(text));

  const caption = captionCandidates
    .sort((a, b) => b.length - a.length)[0]
    ?.slice(0, 1000) ?? articleText.slice(0, 1000);

  // Username from first anchor that looks like a profile link
  const userLink = article.querySelector(
    'a[href^="/@"], a[href^="/"][href$="/"], header a'
  ) as HTMLAnchorElement | null;
  const username =
    userLink?.textContent?.trim() ||
    userLink?.href?.split('/').filter(Boolean).pop() ||
    '';

  // Hashtags extracted from caption text
  const hashtags = (caption.match(/#\w+/g) ?? []).slice(0, 10);

  // Alt text from images inside the post (describes photo content)
  const altText = Array.from(article.querySelectorAll('img[alt]'))
    .map(img => img.getAttribute('alt'))
    .filter((a): a is string => !!a && a.length > 3)
    .join(' | ')
    .slice(0, 400);

  return {
    success: true,
    data: { shortcode, caption, username, hashtags, altText, articleText },
  };
}
