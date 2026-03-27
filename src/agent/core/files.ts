import {
  addRecoveryAttempt,
  addStep,
  beginStep,
  clearTrace,
  completeStep,
  detectLoopRisk,
  getTrace,
  getTraceDetailed,
  getTraceState,
  markLoopDetected,
  markStepStuck,
  startTrace,
  type CompactTraceEntry,
  type DetailedTraceStep
} from './execution_trace';
import {
  clearShortTermMemory,
  getShortTermMemory,
  incrementStep,
  setCurrentStep,
  setGoal,
  setLastAction,
  setLastSuccess,
  type ShortTermMemory
} from './short_term_memory';
import {
  getCurrentDomain,
  getSelector,
  getSelectorForCurrentDomain,
  saveSelector,
  saveSelectorForCurrentDomain
} from './long_term_memory';
import type { ToolResult } from './types';
import { bestMatch, normalizeText } from '../utils/matcher';
import { getInteractiveElements } from '../utils/dom';

export type ToolExecutor = (tool: string, args: Record<string, unknown>) => Promise<ToolResult>;

export type RetryResult = ToolResult & {
  attempts: Array<{ strategy: string; success: boolean; error?: string }>;
};

function asQuery(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

// 1) Compact Execution Trace API
export {
  addStep,
  beginStep,
  completeStep,
  markStepStuck,
  addRecoveryAttempt,
  detectLoopRisk,
  markLoopDetected,
  startTrace,
  getTrace,
  getTraceDetailed,
  getTraceState,
  clearTrace
};
export type { CompactTraceEntry, DetailedTraceStep };

// 2) Short-term Memory API
export function updateShortTermMemory(patch: Partial<ShortTermMemory>): void {
  if (typeof patch.goal === 'string') setGoal(patch.goal);
  if (typeof patch.currentStep === 'number') setCurrentStep(patch.currentStep);
  if (typeof patch.lastAction === 'string') setLastAction(patch.lastAction);
  if (typeof patch.lastSuccess === 'boolean') setLastSuccess(patch.lastSuccess);
}

export function markAction(action: string, success: boolean): void {
  incrementStep();
  setLastAction(action);
  setLastSuccess(success);
}

export { getShortTermMemory, clearShortTermMemory };

// 3) Long-term Memory API
export { saveSelector, getSelector, saveSelectorForCurrentDomain, getSelectorForCurrentDomain, getCurrentDomain };

// 4) Failure Recovery API
export async function executeWithRetry(
  tool: string,
  args: Record<string, unknown>,
  executeTool: ToolExecutor
): Promise<RetryResult> {
  const attempts: RetryResult['attempts'] = [];
  const query = asQuery(args.query);

  const attempt = async (
    strategy: string,
    toolName: string,
    toolArgs: Record<string, unknown>
  ): Promise<ToolResult> => {
    const result = await executeTool(toolName, toolArgs);
    attempts.push({ strategy, success: result.success, error: result.error });
    return result;
  };

  // Strategy 1: stored selector retries
  if (query) {
    const stored = await getSelectorForCurrentDomain(query);
    if (stored) {
      for (let i = 0; i < 2; i += 1) {
        const result = await attempt(`stored_selector_retry_${i + 1}`, tool, { ...args, selector: stored });
        if (result.success) return { ...result, attempts };
      }
    }
  }

  // Base attempt
  const base = await attempt('base_attempt', tool, args);
  if (base.success) return { ...base, attempts };

  // Strategy 2: find_by_text and retry
  if (query) {
    await attempt('find_by_text_probe', 'find_by_text', { query });
    const retried = await attempt('retry_after_find_by_text', tool, { ...args, query });
    if (retried.success) return { ...retried, attempts };
  }

  // Strategy 3: fuzzy query
  if (query) {
    const candidates = getInteractiveElements().map((el) => normalizeText((el as HTMLElement).innerText || el.textContent || ''));
    const fuzzy = bestMatch(query, candidates, (v) => v, 0.2)?.item;
    if (fuzzy) {
      const fuzzyResult = await attempt('fuzzy_query_retry', tool, { ...args, query: fuzzy });
      if (fuzzyResult.success) return { ...fuzzyResult, attempts };
    }
  }

  // Strategy 4: alternative nearby semantic match
  if (query) {
    const altTool = tool.includes('type') || tool.includes('input') ? 'find_input' : 'find_button';
    const altProbe = await attempt('alternative_element_probe', altTool, { query });
    if (altProbe.success) {
      const altResult = await attempt('retry_with_alternative_element', tool, { ...args, query });
      if (altResult.success) return { ...altResult, attempts };
    }
  }

  // Strategy 5: scroll and retry
  await attempt('scroll_before_final_retry', 'scroll', { direction: 'down', amount: 420 });
  const final = await attempt('final_retry_after_scroll', tool, args);

  return { ...final, attempts };
}
