// ── Template step types ───────────────────────────────────────────────────────

export type TemplateStep =
  | { action: 'navigate';      url: string }
  | { action: 'click';         selector: string }
  | { action: 'highlight';     selector: string }
  | { action: 'wait_element';  selector: string; timeout?: number }
  | { action: 'wait_ms';       ms: number }
  | { action: 'scroll';        direction: 'up' | 'down'; amount?: number }
  | { action: 'press_key';     key: string }
  // AI-generated comment: reads post context then calls OpenAI
  | { action: 'ai_comment' }
  // Generic agent tool call — maps directly to toolRegistry
  | { action: 'run_tool';      tool: string; args?: Record<string, unknown> }
  // Keyword scan: scan up to maxPosts feed posts, engage only on matches,
  // fall back to Explore search if fewer than `count` matches are found.
  | { action: 'keyword_scan'; keyword: string; count: number; maxPosts?: number; mode?: 'like_and_comment' | 'like_only' | 'comment_only' };

export interface TemplateParams {
  count: number;
  keyword?: string;
}

export interface TemplateDef {
  label: string;
  description: string;
  needsKeyword?: boolean;
  build(params: TemplateParams): TemplateStep[];
}

// ── Per-post step builders ────────────────────────────────────────────────────

function likeSteps(): TemplateStep[] {
  return [
    { action: 'run_tool', tool: 'ig_like_post' },
    { action: 'wait_ms',  ms: 800 },
  ];
}

function commentSteps(): TemplateStep[] {
  return [
    { action: 'ai_comment' },
    { action: 'wait_ms',   ms: 1000 },
    { action: 'press_key', key: 'Escape' },
    { action: 'wait_ms',   ms: 600 },
  ];
}

function scrollNextPost(): TemplateStep[] {
  return [
    { action: 'scroll',  direction: 'down', amount: 900 },
    { action: 'wait_ms', ms: 1200 },
  ];
}

// ── Instagram templates ───────────────────────────────────────────────────────

const instagram: Record<string, TemplateDef> = {

  like_and_ai_comment: {
    label: 'Like & Comment',
    description: 'Likes each post and leaves an AI-generated comment based on the post content.',
    build({ count, keyword }) {
      const base: TemplateStep[] = [
        { action: 'navigate',     url: 'https://www.instagram.com' },
        { action: 'wait_element', selector: 'article', timeout: 10000 },
        { action: 'wait_ms',      ms: 1000 },
      ];
      if (keyword?.trim()) {
        // Keyword provided → scan up to 15 posts, fall back to search if needed
        return [...base, { action: 'keyword_scan', keyword, count, maxPosts: 15, mode: 'like_and_comment' }];
      }
      const steps = [...base];
      for (let i = 0; i < count; i++) {
        steps.push(...likeSteps(), ...commentSteps(), ...scrollNextPost());
      }
      return steps;
    },
  },

  like_only: {
    label: 'Like Only',
    description: 'Likes posts without commenting.',
    build({ count, keyword }) {
      const base: TemplateStep[] = [
        { action: 'navigate',     url: 'https://www.instagram.com' },
        { action: 'wait_element', selector: 'article', timeout: 10000 },
        { action: 'wait_ms',      ms: 1000 },
      ];
      if (keyword?.trim()) {
        return [...base, { action: 'keyword_scan', keyword, count, maxPosts: 15, mode: 'like_only' }];
      }
      const steps = [...base];
      for (let i = 0; i < count; i++) {
        steps.push(...likeSteps(), ...scrollNextPost());
      }
      return steps;
    },
  },

  ai_comment_only: {
    label: 'Comment Only',
    description: 'Leaves an AI-generated comment on each post without liking.',
    build({ count, keyword }) {
      const base: TemplateStep[] = [
        { action: 'navigate',     url: 'https://www.instagram.com' },
        { action: 'wait_element', selector: 'article', timeout: 10000 },
        { action: 'wait_ms',      ms: 1000 },
      ];
      if (keyword?.trim()) {
        return [...base, { action: 'keyword_scan', keyword, count, maxPosts: 15, mode: 'comment_only' }];
      }
      const steps = [...base];
      for (let i = 0; i < count; i++) {
        steps.push(...commentSteps(), ...scrollNextPost());
      }
      return steps;
    },
  },

  keyword_match: {
    label: 'Keyword Match',
    description:
      'Scans up to 10 feed posts for your keyword. Likes & comments on matches. ' +
      'Falls back to hashtag/Explore search if no matches are found in the feed.',
    needsKeyword: true,
    build({ count, keyword }) {
      return [
        { action: 'navigate',     url: 'https://www.instagram.com' },
        { action: 'wait_element', selector: 'article', timeout: 10000 },
        { action: 'wait_ms',      ms: 1000 },
        { action: 'keyword_scan', keyword: keyword ?? '', count, maxPosts: 10 },
      ];
    },
  },

  like_explore_posts: {
    label: 'Like Explore Posts',
    description: 'Opens the Explore page and likes posts found there.',
    build({ count }) {
      const steps: TemplateStep[] = [
        { action: 'navigate',     url: 'https://www.instagram.com/explore/' },
        { action: 'wait_element', selector: 'article, main img', timeout: 10000 },
        { action: 'wait_ms',      ms: 1500 },
      ];
      for (let i = 0; i < count; i++) {
        steps.push(...likeSteps(), ...scrollNextPost());
      }
      return steps;
    },
  },

  follow_user: {
    label: 'Follow Users',
    description: 'Visits the Explore page and follows suggested accounts.',
    build({ count }) {
      const steps: TemplateStep[] = [
        { action: 'navigate',     url: 'https://www.instagram.com/explore/people/' },
        { action: 'wait_element', selector: 'button', timeout: 10000 },
        { action: 'wait_ms',      ms: 1000 },
      ];
      for (let i = 0; i < count; i++) {
        steps.push(
          { action: 'run_tool', tool: 'find_by_text', args: { text: 'Follow' } },
          { action: 'run_tool', tool: 'click',        args: { query: 'Follow' } },
          { action: 'wait_ms',  ms: 1200 },
        );
      }
      return steps;
    },
  },

};

// ── Registry ──────────────────────────────────────────────────────────────────

export const TEMPLATES: Record<string, Record<string, TemplateDef>> = {
  instagram,
};

export const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram',
};
