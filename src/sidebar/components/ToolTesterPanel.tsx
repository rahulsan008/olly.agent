import React, { useMemo, useState } from 'react';

type TestResult = {
  success: boolean;
  data?: unknown;
  error?: string;
};

const TOOLS = [
  'click',
  'type',
  'hover',
  'scroll',
  'press_key',
  'find',
  'find_by_text',
  'find_button',
  'find_input',
  'get_page_text',
  'get_buttons',
  'get_inputs',
  'get_links',
  'get_visible_elements',
  'wait_for_element',
  'wait_for_text',
  'go_to_url',
  'go_back',
  'refresh',
  'copy',
  'paste',
  'get_selected',
  'generate_selector',
  'record_start',
  'record_stop',
  'record_replay'
] as const;

const TOOL_HINTS: Partial<Record<(typeof TOOLS)[number], string>> = {
  click: '{ "query": "Post button" }',
  type: '{ "query": "search box", "text": "hello" }',
  find_by_text: '{ "query": "Login" }',
  find_button: '{ "query": "Submit" }',
  find_input: '{ "query": "Email" }',
  wait_for_element: '{ "query": "comment box", "timeoutMs": 5000 }',
  wait_for_text: '{ "text": "Welcome" }',
  go_to_url: '{ "url": "https://example.com" }',
  copy: '{ "text": "hello" }',
  generate_selector: '{ "query": "Post button" }',
  press_key: '{ "key": "Enter" }',
  scroll: '{ "direction": "down", "amount": 400 }'
};

function pretty(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function ToolTesterPanel() {
  const [tool, setTool] = useState<(typeof TOOLS)[number]>('find_by_text');
  const [query, setQuery] = useState('');
  const [rawArgs, setRawArgs] = useState('{\n  "query": ""\n}');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);

  const placeholder = useMemo(
    () => TOOL_HINTS[tool] ?? '{\n  "query": ""\n}',
    [tool]
  );

  const runTool = async () => {
    setLoading(true);
    setResult(null);
    setRequestError(null);

    try {
      const parsed = rawArgs.trim() ? JSON.parse(rawArgs) : {};
      const args = query.trim() ? { ...parsed, query: query.trim() } : parsed;

      const response = await chrome.runtime.sendMessage({
        type: 'RUN_TOOL_TEST',
        tool,
        args
      });

      if (!response?.ok) {
        setRequestError(response?.error ?? 'Failed to run tool');
      } else {
        setResult(response.result as TestResult);
      }
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : 'Invalid args JSON');
    } finally {
      setLoading(false);
    }
  };

  const badge = result?.success
    ? { label: 'success', bg: 'rgba(34,197,94,0.2)', fg: '#86efac' }
    : result
      ? { label: 'error', bg: 'rgba(239,68,68,0.2)', fg: '#fca5a5' }
      : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '12px', gap: 10 }}>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
        Select a tool, set args, then run it on the active tab.
      </div>

      <div>
        <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Tool</label>
        <select
          value={tool}
          onChange={(e) => setTool(e.target.value as (typeof TOOLS)[number])}
          disabled={loading}
          style={{
            width: '100%', padding: '8px 10px', borderRadius: 8, boxSizing: 'border-box',
            border: '1px solid var(--border)', background: 'var(--surface2)',
            color: 'var(--text)', fontSize: 13, outline: 'none'
          }}
        >
          {TOOLS.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      </div>

      <div>
        <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Query (optional)</label>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={loading}
          placeholder="comment box"
          style={{
            width: '100%', padding: '8px 10px', borderRadius: 8, boxSizing: 'border-box',
            border: '1px solid var(--border)', background: 'var(--surface2)',
            color: 'var(--text)', fontSize: 13, outline: 'none'
          }}
        />
      </div>

      <div>
        <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Args JSON</label>
        <textarea
          value={rawArgs}
          onChange={(e) => setRawArgs(e.target.value)}
          disabled={loading}
          placeholder={placeholder}
          rows={7}
          style={{
            width: '100%', padding: '8px 10px', borderRadius: 8, boxSizing: 'border-box',
            border: '1px solid var(--border)', background: 'var(--surface2)',
            color: 'var(--text)', fontSize: 12, fontFamily: 'monospace', outline: 'none', resize: 'vertical'
          }}
        />
      </div>

      <button
        onClick={runTool}
        disabled={loading}
        style={{
          border: 0, borderRadius: 9, cursor: 'pointer',
          background: 'var(--accent)', color: '#fff', fontWeight: 600,
          fontSize: 13, padding: '9px 0', opacity: loading ? 0.6 : 1
        }}
      >
        {loading ? 'Running…' : 'Run Tool'}
      </button>

      {requestError && (
        <div style={{ fontSize: 12, color: '#fca5a5', background: 'rgba(239,68,68,0.1)', border: '1px solid #7f1d1d', borderRadius: 8, padding: '8px 10px' }}>
          {requestError}
        </div>
      )}

      {result && (
        <div style={{
          border: '1px solid var(--border)',
          borderRadius: 10,
          background: 'var(--surface2)',
          padding: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          minHeight: 120
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Result</span>
            {badge && (
              <span style={{ fontSize: 11, borderRadius: 6, padding: '2px 8px', background: badge.bg, color: badge.fg }}>
                {badge.label}
              </span>
            )}
          </div>

          {result.error && <div style={{ color: '#fca5a5', fontSize: 12 }}>{result.error}</div>}

          <pre style={{ margin: 0, fontSize: 11, color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {pretty(result.data ?? result)}
          </pre>
        </div>
      )}
    </div>
  );
}
