import React, { useMemo, useState } from 'react';
import { AGENTIC_TOOLS, type AgenticToolName } from '../../shared/agent_tools';

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
  'get_element_text',
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
  'record_replay',
  'screenshot'
  ,
  'ig_like_post',
  'ig_comment_post',
  'ig_get_post_context',
  'ig_get_grid_posts',
  'ig_open_grid_post',
  'ig_close_post_view'
] as const;

const TOOL_HINTS: Partial<Record<AgenticToolName, string>> = {
  click: '{ "query": "Post button" }',
  type: '{ "query": "search box", "text": "hello" }',
  find_by_text: '{ "query": "Login" }',
  find_button: '{ "query": "Submit" }',
  find_input: '{ "query": "Email" }',
  get_element_text: '{ "selector": "article", "all": false }',
  extract: '{ "query": "main heading" }',
  wait_for_element: '{ "query": "comment box", "timeoutMs": 5000 }',
  wait_for_text: '{ "text": "Welcome" }',
  go_to_url: '{ "url": "https://example.com" }',
  copy: '{ "text": "hello" }',
  generate_selector: '{ "query": "Post button" }',
  press_key: '{ "key": "Enter" }',
  scroll: '{ "direction": "down", "amount": 400 }',
  ig_comment_post: '{ "text": "Testing comment from tool tab" }',
  ig_get_grid_posts: '{ "limit": 12 }',
  ig_open_grid_post: '{ "index": 0 }'
  start_trace: '{ "goal": "submit comment flow" }',
  get_new_plan: '{ "query": "Go to YouTube and subscribe to MrBeast", "imageBase64": "<optional base64>" }',
  understand_screen: '{ "goal": "Click Subscribe", "trace": [], "context": { "previousFailure": { "tool": "click", "error": "Button not found" } } }',
  classify_page_state: '{ "context": { "url": "https://example.com", "text": "..." } }',
  extract_structured_data: '{ "schema": { "fields": ["name", "title"] }, "context": { "text": "..." } }',
  rank_candidates: '{ "goal": "pick best button", "candidates": [{"text":"Subscribe"},{"text":"Share"}] }',
  generate_search_query: '{ "goal": "find fitness coach leads from USA" }',
  rewrite_action_query: '{ "goal": "click follow", "failedQuery": "follow", "trace": [] }',
  detect_blocker: '{ "goal": "continue flow", "context": { "text": "captcha" } }',
  compose_text: '{ "goal": "comment on post", "context": { "tone": "friendly" } }',
  verify_task_completion: '{ "goal": "subscribed to channel", "context": { "pageText": "Subscribed" } }',
  strategy_replan: '{ "goal": "complete task", "trace": [], "context": { "failedStep": "click" } }'
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button onClick={copy} style={{
      fontSize: 11, padding: '2px 8px', borderRadius: 5, cursor: 'pointer',
      border: '1px solid var(--border)', background: 'transparent',
      color: copied ? '#86efac' : 'var(--muted)',
    }}>
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

function pretty(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function ToolTesterPanel() {
  const [tool, setTool] = useState<AgenticToolName>('find_by_text');
  const [query, setQuery] = useState('');
  const [rawArgs, setRawArgs] = useState(TOOL_HINTS['find_by_text'] ?? '{\n  "query": ""\n}');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);

  const defaultArgs = (t: AgenticToolName) => TOOL_HINTS[t] ?? '{\n  "query": ""\n}';

  const handleToolChange = (t: AgenticToolName) => {
    setTool(t);
    setQuery('');
    setRawArgs(defaultArgs(t));
    setResult(null);
    setRequestError(null);
  };

  const placeholder = useMemo(() => defaultArgs(tool), [tool]);

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
          onChange={(e) => handleToolChange(e.target.value as AgenticToolName)}
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
          display: 'flex',
          flexDirection: 'column',
          minHeight: 120,
          maxHeight: 320,
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '7px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>Result</span>
              {badge && (
                <span style={{ fontSize: 11, borderRadius: 6, padding: '2px 8px', background: badge.bg, color: badge.fg }}>
                  {badge.label}
                </span>
              )}
            </div>
            <CopyButton text={pretty(result.data ?? result)} />
          </div>

          {/* Scrollable body */}
          <div style={{ overflowY: 'auto', padding: '8px 10px', flex: 1 }}>
            {result.error && <div style={{ color: '#fca5a5', fontSize: 12, marginBottom: 4 }}>{result.error}</div>}
            <pre style={{ margin: 0, fontSize: 11, color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {pretty(result.data ?? result)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
