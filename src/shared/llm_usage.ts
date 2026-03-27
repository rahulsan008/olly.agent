import type { LlmUsageEntry, LlmUsageSummary } from './types';

export const LLM_USAGE_STORAGE_KEY = 'llmUsageEntries';
export const LLM_USAGE_MAX_ENTRIES = 250;

type ModelPricing = {
  inputPer1M: number;
  outputPer1M: number;
  cachedInputPer1M?: number;
};

// Estimated local pricing table. Update these values when model pricing changes.
const MODEL_PRICING_USD_PER_1M: Record<string, ModelPricing> = {
  'gpt-5.4': { inputPer1M: 1.25, outputPer1M: 10 },
  'gpt-5.1': { inputPer1M: 1.25, outputPer1M: 10 },
  'gpt-5.1-mini': { inputPer1M: 0.25, outputPer1M: 2 },
  'gpt-4o-mini': { inputPer1M: 0.15, outputPer1M: 0.6 }
};

export function estimateLlmCostUsd(params: {
  model: string;
  promptTokens: number;
  completionTokens: number;
  cachedTokens?: number;
}): number {
  const pricing = MODEL_PRICING_USD_PER_1M[params.model];
  if (!pricing) return 0;

  const promptTokens = Math.max(0, params.promptTokens);
  const completionTokens = Math.max(0, params.completionTokens);
  const cachedTokens = Math.max(0, Math.min(params.cachedTokens ?? 0, promptTokens));
  const uncachedPromptTokens = Math.max(0, promptTokens - cachedTokens);

  const inputCost = (uncachedPromptTokens / 1_000_000) * pricing.inputPer1M;
  const cachedInputCost = pricing.cachedInputPer1M
    ? (cachedTokens / 1_000_000) * pricing.cachedInputPer1M
    : 0;
  const outputCost = (completionTokens / 1_000_000) * pricing.outputPer1M;

  return inputCost + cachedInputCost + outputCost;
}

export function summarizeLlmUsage(entries: LlmUsageEntry[]): LlmUsageSummary {
  return entries.reduce<LlmUsageSummary>((summary, entry) => ({
    totalCalls: summary.totalCalls + 1,
    successfulCalls: summary.successfulCalls + (entry.status === 'success' ? 1 : 0),
    failedCalls: summary.failedCalls + (entry.status === 'error' ? 1 : 0),
    promptTokens: summary.promptTokens + entry.promptTokens,
    completionTokens: summary.completionTokens + entry.completionTokens,
    totalTokens: summary.totalTokens + entry.totalTokens,
    estimatedCostUsd: summary.estimatedCostUsd + entry.estimatedCostUsd
  }), {
    totalCalls: 0,
    successfulCalls: 0,
    failedCalls: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0
  });
}
