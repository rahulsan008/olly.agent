import type { ToolResult } from '../../core/types';

type GetNewPlanArgs = {
  query?: string;
  goal?: string;
  imageBase64?: string;
  imageDataUrl?: string;
  trace?: unknown[];
  context?: Record<string, unknown>;
  completed_tasks?: string[];
  failed_tasks?: string[];
  understand_prev_screen?: string;
};

function toDataUrl(input?: string): string | undefined {
  if (!input) return undefined;
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith('data:image/')) return trimmed;
  return `data:image/jpeg;base64,${trimmed}`;
}

export async function run(args: GetNewPlanArgs): Promise<ToolResult> {
  const goal = typeof args.query === 'string' && args.query.trim()
    ? args.query.trim()
    : (typeof args.goal === 'string' ? args.goal.trim() : '');

  if (!goal) return { success: false, error: 'Missing goal/query' };

  const imageDataUrl = toDataUrl(args.imageDataUrl) ?? toDataUrl(args.imageBase64);
  const response = await chrome.runtime.sendMessage({
    type: 'GET_NEW_PLAN',
    goal,
    imageDataUrl: imageDataUrl ?? null,
    trace: Array.isArray(args.trace) ? args.trace : [],
    context: (args.context && typeof args.context === 'object') ? args.context : {},
    completed_tasks: Array.isArray(args.completed_tasks) ? args.completed_tasks : [],
    failed_tasks: Array.isArray(args.failed_tasks) ? args.failed_tasks : [],
    understand_prev_screen: typeof args.understand_prev_screen === 'string' ? args.understand_prev_screen : ''
  }) as { ok: boolean; plan?: unknown; error?: string } | undefined;

  if (!response?.ok || !response.plan) {
    return { success: false, error: response?.error ?? 'Failed to generate new plan' };
  }

  return { success: true, data: response.plan };
}
