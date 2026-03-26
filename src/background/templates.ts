// ── Template step types ───────────────────────────────────────────────────────

export type TemplateStep =
  | { action: 'navigate'; url: string }
  | { action: 'click'; selector: string }
  | { action: 'type'; selector: string; text: string }
  | { action: 'highlight'; selector: string }
  | { action: 'wait_element'; selector: string; timeout?: number }
  | { action: 'wait_ms'; ms: number }
  | { action: 'submit_comment' }
  | { action: 'scroll'; direction: 'up' | 'down'; amount?: number }
  | { action: 'press_key'; key: string }
  | { action: 'ai_comment' };

export interface TemplateParams {
  count: number;
  commentText: string;
}

export interface TemplateDef {
  label: string;
  needsComment: boolean;
  needsAiComment?: boolean;
  build(params: TemplateParams): TemplateStep[];
}

// ── Platform templates ────────────────────────────────────────────────────────

// Selectors for Instagram action buttons.
// After liking, the button aria-label becomes "Unlike", so next post's "Like" is always a new post.
const IG_LIKE    = 'button[aria-label="Like"], svg[aria-label="Like"]';
const IG_COMMENT = 'button[aria-label="Comment"], svg[aria-label="Comment"]';
const IG_TEXTAREA = "textarea[aria-label='Add a comment…'], textarea[placeholder='Add a comment…'], textarea[aria-label='Add a comment\u2026']";

// Steps shared by every comment sequence: open box → fill text → submit → close → scroll
function commentSteps(textStep: TemplateStep): TemplateStep[] {
  return [
    { action: 'click', selector: IG_COMMENT },
    { action: 'wait_element', selector: IG_TEXTAREA, timeout: 5000 },
    textStep,
    { action: 'wait_ms', ms: 500 },
    { action: 'submit_comment' },
    { action: 'wait_ms', ms: 1000 },
    { action: 'press_key', key: 'Escape' },   // close comment box
    { action: 'wait_ms', ms: 600 },
    { action: 'scroll', direction: 'down', amount: 900 },
    { action: 'wait_ms', ms: 1200 },
  ];
}

const instagram: Record<string, TemplateDef> = {
  like_and_comment: {
    label: 'Like & Comment',
    needsComment: true,
    build({ count, commentText }) {
      const steps: TemplateStep[] = [
        { action: 'navigate', url: 'https://www.instagram.com' },
        { action: 'wait_element', selector: 'article', timeout: 10000 },
        { action: 'wait_ms', ms: 1000 },
      ];
      for (let i = 0; i < count; i++) {
        steps.push(
          { action: 'click', selector: IG_LIKE },
          { action: 'wait_ms', ms: 800 },
          ...commentSteps({ action: 'type', selector: IG_TEXTAREA, text: commentText }),
        );
      }
      return steps;
    }
  },

  like_and_ai_comment: {
    label: 'Like & AI Comment',
    needsComment: false,
    needsAiComment: true,
    build({ count }) {
      const steps: TemplateStep[] = [
        { action: 'navigate', url: 'https://www.instagram.com' },
        { action: 'wait_element', selector: 'article', timeout: 10000 },
        { action: 'wait_ms', ms: 1000 },
      ];
      for (let i = 0; i < count; i++) {
        steps.push(
          { action: 'click', selector: IG_LIKE },
          { action: 'wait_ms', ms: 800 },
          ...commentSteps({ action: 'ai_comment' }),
        );
      }
      return steps;
    }
  },

  like_only: {
    label: 'Like Only',
    needsComment: false,
    build({ count }) {
      const steps: TemplateStep[] = [
        { action: 'navigate', url: 'https://www.instagram.com' },
        { action: 'wait_element', selector: 'article', timeout: 10000 },
        { action: 'wait_ms', ms: 1000 },
      ];
      for (let i = 0; i < count; i++) {
        steps.push(
          { action: 'click', selector: IG_LIKE },
          { action: 'wait_ms', ms: 800 },
          { action: 'scroll', direction: 'down', amount: 900 },
          { action: 'wait_ms', ms: 1000 },
        );
      }
      return steps;
    }
  },

  comment_only: {
    label: 'Comment Only',
    needsComment: true,
    build({ count, commentText }) {
      const steps: TemplateStep[] = [
        { action: 'navigate', url: 'https://www.instagram.com' },
        { action: 'wait_element', selector: 'article', timeout: 10000 },
        { action: 'wait_ms', ms: 1000 },
      ];
      for (let i = 0; i < count; i++) {
        steps.push(...commentSteps({ action: 'type', selector: IG_TEXTAREA, text: commentText }));
      }
      return steps;
    }
  },

  ai_comment_only: {
    label: 'AI Comment Only',
    needsComment: false,
    needsAiComment: true,
    build({ count }) {
      const steps: TemplateStep[] = [
        { action: 'navigate', url: 'https://www.instagram.com' },
        { action: 'wait_element', selector: 'article', timeout: 10000 },
        { action: 'wait_ms', ms: 1000 },
      ];
      for (let i = 0; i < count; i++) {
        steps.push(...commentSteps({ action: 'ai_comment' }));
      }
      return steps;
    }
  },
};

// ── Registry ──────────────────────────────────────────────────────────────────

export const TEMPLATES: Record<string, Record<string, TemplateDef>> = {
  instagram,
};

export const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram',
};
