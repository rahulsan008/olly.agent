import { estimateLlmCostUsd, LLM_USAGE_MAX_ENTRIES, LLM_USAGE_STORAGE_KEY } from '../../shared/llm_usage';
import type { LlmUsageEntry } from '../../shared/types';

type UsageShape = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_tokens_details?: {
    cached_tokens?: number;
  };
};

async function readEntries(): Promise<LlmUsageEntry[]> {
  const data = await chrome.storage.local.get(LLM_USAGE_STORAGE_KEY);
  const raw = data[LLM_USAGE_STORAGE_KEY];
  return Array.isArray(raw) ? raw as LlmUsageEntry[] : [];
}

async function writeEntries(entries: LlmUsageEntry[]): Promise<void> {
  await chrome.storage.local.set({
    [LLM_USAGE_STORAGE_KEY]: entries.slice(0, LLM_USAGE_MAX_ENTRIES)
  });
}

export async function recordLlmUsage(params: {
  source: string;
  model: string;
  usage?: UsageShape | null;
  status: 'success' | 'error';
  error?: string;
}): Promise<void> {
  const promptTokens = Math.max(0, params.usage?.prompt_tokens ?? 0);
  const completionTokens = Math.max(0, params.usage?.completion_tokens ?? 0);
  const totalTokens = Math.max(
    promptTokens + completionTokens,
    params.usage?.total_tokens ?? 0
  );
  const cachedTokens = Math.max(0, params.usage?.prompt_tokens_details?.cached_tokens ?? 0);

  const entry: LlmUsageEntry = {
    id: crypto.randomUUID(),
    source: params.source,
    model: params.model,
    timestamp: Date.now(),
    promptTokens,
    completionTokens,
    totalTokens,
    cachedTokens,
    estimatedCostUsd: estimateLlmCostUsd({
      model: params.model,
      promptTokens,
      completionTokens,
      cachedTokens
    }),
    status: params.status,
    error: params.error
  };

  const current = await readEntries();
  await writeEntries([entry, ...current]);
}

export async function clearLlmUsage(): Promise<void> {
  await chrome.storage.local.set({ [LLM_USAGE_STORAGE_KEY]: [] });
}
