import React, { useEffect, useMemo, useState } from 'react';
import { LLM_USAGE_STORAGE_KEY, summarizeLlmUsage } from '../../shared/llm_usage';
import type { LlmUsageEntry } from '../../shared/types';

function formatUsd(value: number): string {
  return `$${value.toFixed(value < 0.01 ? 4 : 2)}`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

function metricCard(label: string, value: string, subtext?: string) {
  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: 10,
      background: 'var(--surface2)',
      padding: '10px 11px'
    }}>
      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginTop: 3 }}>{value}</div>
      {subtext && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{subtext}</div>}
    </div>
  );
}

export function LlmUsagePanel() {
  const [entries, setEntries] = useState<LlmUsageEntry[]>([]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      const data = await chrome.storage.local.get(LLM_USAGE_STORAGE_KEY);
      if (!active) return;
      const raw = data[LLM_USAGE_STORAGE_KEY];
      setEntries(Array.isArray(raw) ? raw as LlmUsageEntry[] : []);
    };

    const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName !== 'local' || !changes[LLM_USAGE_STORAGE_KEY]) return;
      const nextValue = changes[LLM_USAGE_STORAGE_KEY].newValue;
      setEntries(Array.isArray(nextValue) ? nextValue as LlmUsageEntry[] : []);
    };

    void load();
    chrome.storage.onChanged.addListener(listener);
    return () => {
      active = false;
      chrome.storage.onChanged.removeListener(listener);
    };
  }, []);

  const summary = useMemo(() => summarizeLlmUsage(entries), [entries]);

  const clearUsage = async () => {
    await chrome.storage.local.set({ [LLM_USAGE_STORAGE_KEY]: [] });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 12, gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
          Tracks OpenAI calls, tokens, and estimated cost from extension flows. Stored in `chrome.storage.local`.
        </div>
        <button
          onClick={clearUsage}
          style={{
            border: '1px solid var(--border)',
            borderRadius: 8,
            background: 'transparent',
            color: 'var(--text)',
            padding: '6px 9px',
            fontSize: 11,
            cursor: 'pointer',
            flexShrink: 0
          }}
        >
          Clear
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {metricCard('Calls', formatNumber(summary.totalCalls), `${summary.successfulCalls} success · ${summary.failedCalls} failed`)}
        {metricCard('Estimated Cost', formatUsd(summary.estimatedCostUsd), 'Uses local pricing table')}
        {metricCard('Prompt Tokens', formatNumber(summary.promptTokens))}
        {metricCard('Completion Tokens', formatNumber(summary.completionTokens))}
      </div>

      <div style={{
        border: '1px solid var(--border)',
        borderRadius: 10,
        background: 'var(--surface2)',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 140,
        overflow: 'hidden'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 10px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0
        }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Recent LLM Calls</span>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>{formatNumber(summary.totalTokens)} total tokens</span>
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {entries.length === 0 ? (
            <div style={{ padding: 14, fontSize: 12, color: 'var(--muted)' }}>
              No LLM usage recorded yet.
            </div>
          ) : (
            entries.map((entry) => (
              <div
                key={entry.id}
                style={{
                  padding: '10px 12px',
                  borderBottom: '1px solid var(--border)',
                  display: 'grid',
                  gap: 4
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 600 }}>{entry.source}</div>
                  <div style={{
                    fontSize: 11,
                    borderRadius: 6,
                    padding: '2px 7px',
                    background: entry.status === 'success' ? 'rgba(34,197,94,0.18)' : 'rgba(239,68,68,0.16)',
                    color: entry.status === 'success' ? '#86efac' : '#fca5a5'
                  }}>
                    {entry.status}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                  {entry.model} · {formatTime(entry.timestamp)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                  prompt {formatNumber(entry.promptTokens)} · completion {formatNumber(entry.completionTokens)} · total {formatNumber(entry.totalTokens)} · est. {formatUsd(entry.estimatedCostUsd)}
                </div>
                {entry.error && (
                  <div style={{ fontSize: 11, color: '#fca5a5' }}>{entry.error}</div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
