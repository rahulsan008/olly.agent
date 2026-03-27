import React, { useState } from 'react';
import { useStore } from '../store';
import { TEMPLATES, PLATFORM_LABELS } from '../../background/templates';

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 8, boxSizing: 'border-box',
  border: '1px solid var(--border)', background: 'var(--surface2)',
  color: 'var(--text)', fontSize: 13, outline: 'none'
};

const labelStyle: React.CSSProperties = {
  fontSize: 11, color: 'var(--muted)', marginBottom: 4, display: 'block'
};

export function TemplatePanel() {
  const { agentState, toolLogs, clearChat } = useStore();
  const isRunning = agentState.isRunning;

  const platforms = Object.keys(TEMPLATES);
  const [platform, setPlatform] = useState(platforms[0]);
  const [action, setAction]     = useState(Object.keys(TEMPLATES[platforms[0]])[0]);
  const [count, setCount]       = useState(2);

  const [keyword, setKeyword]   = useState('');

  const actions     = Object.entries(TEMPLATES[platform] ?? {});
  const currentTmpl = TEMPLATES[platform]?.[action];
  const needsKeyword = currentTmpl?.needsKeyword ?? false;

  const handlePlatformChange = (p: string) => {
    setPlatform(p);
    setAction(Object.keys(TEMPLATES[p])[0]);
  };

  const handleRun = () => {
    clearChat();
    chrome.runtime.sendMessage({
      type: 'RUN_TEMPLATE', platform, action, count,
      ...(keyword.trim() ? { keyword: keyword.trim() } : {}),
    });
  };

  const handleStop = () => {
    chrome.runtime.sendMessage({ type: 'STOP_TASK' });
  };

  const logs = [...toolLogs].reverse();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Form */}
      <div style={{
        padding: '14px 14px 10px', borderBottom: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0
      }}>
        {/* Platform + Action */}
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Platform</label>
            <select
              value={platform}
              onChange={e => handlePlatformChange(e.target.value)}
              disabled={isRunning}
              style={inputStyle}
            >
              {platforms.map(p => (
                <option key={p} value={p}>{PLATFORM_LABELS[p] ?? p}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Action</label>
            <select
              value={action}
              onChange={e => setAction(e.target.value)}
              disabled={isRunning}
              style={inputStyle}
            >
              {actions.map(([key, tmpl]) => (
                <option key={key} value={key}>{tmpl.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Template description */}
        {currentTmpl?.description && (
          <div style={{
            fontSize: 11, color: 'var(--muted)', padding: '6px 10px',
            background: 'var(--surface2)', borderRadius: 7, border: '1px solid var(--border)',
            lineHeight: 1.5
          }}>
            {currentTmpl.description}
          </div>
        )}

        {/* Count */}
        <div>
          <label style={labelStyle}>Number of posts</label>
          <input
            type="number"
            min={1} max={20}
            value={count}
            onChange={e => setCount(Math.max(1, parseInt(e.target.value) || 1))}
            disabled={isRunning}
            style={{ ...inputStyle, width: 80 }}
          />
        </div>

        {/* Keyword — always visible; required for Keyword Match, optional hint for others */}
        <div>
          <label style={labelStyle}>
            Keyword{needsKeyword ? <span style={{ color: 'var(--accent)', marginLeft: 4 }}>*</span> : <span style={{ color: 'var(--muted)', marginLeft: 4 }}>(optional)</span>}
          </label>
          <input
            type="text"
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            disabled={isRunning}
            placeholder={needsKeyword ? 'e.g. cricket, travel, AI…' : 'Filter by keyword (Keyword Match only)'}
            style={{
              ...inputStyle,
              borderColor: needsKeyword && !keyword.trim() ? 'rgba(239,68,68,0.4)' : undefined,
            }}
          />
          {needsKeyword && (
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
              Scans up to 10 feed posts. Falls back to hashtag search if no matches found.
            </div>
          )}
        </div>

        {/* AI comment notice */}
        <div style={{
          fontSize: 11, color: 'var(--muted)', padding: '6px 10px',
          background: 'var(--surface2)', borderRadius: 7, border: '1px solid var(--border)'
        }}>
          ✨ Comments are AI-generated from each post's content — no manual input needed
        </div>

        {/* Run / Stop */}
        <div style={{ display: 'flex', gap: 8 }}>
          {!isRunning ? (
            <button
              onClick={handleRun}
              disabled={needsKeyword && !keyword.trim()}
              style={{
                flex: 1, padding: '9px 0', borderRadius: 9, border: 'none', cursor: 'pointer',
                background: 'var(--accent)', color: '#fff', fontWeight: 600, fontSize: 13,
                opacity: needsKeyword && !keyword.trim() ? 0.5 : 1,
              }}
            >
              ▶ Run
            </button>
          ) : (
            <button
              onClick={handleStop}
              style={{
                flex: 1, padding: '9px 0', borderRadius: 9, border: 'none', cursor: 'pointer',
                background: '#7f1d1d', color: '#fca5a5', fontWeight: 600, fontSize: 13
              }}
            >
              ■ Stop
            </button>
          )}
        </div>

        {/* Status */}
        {isRunning && (
          <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
            Step {agentState.stepCount} · running…
          </div>
        )}
        {agentState.error && (
          <div style={{ fontSize: 12, color: '#fca5a5' }}>⚠ {agentState.error}</div>
        )}
      </div>

      {/* Step log */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {logs.length === 0 && (
          <div style={{ color: 'var(--muted)', fontSize: 12, textAlign: 'center', marginTop: 24 }}>
            Steps will appear here when running.
          </div>
        )}
        {logs.map(log => (
          <div key={log.id} style={{
            padding: '6px 10px', borderRadius: 7,
            background: 'var(--surface2)', border: '1px solid var(--border)',
            fontSize: 12
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, color: 'var(--accent)', fontFamily: 'monospace' }}>
                {log.name}
              </span>
              <span style={{
                fontSize: 10, padding: '2px 6px', borderRadius: 4,
                background: log.status === 'success' ? 'rgba(34,197,94,0.15)' : 'rgba(234,179,8,0.15)',
                color: log.status === 'success' ? '#86efac' : '#fde047'
              }}>
                {log.status}
              </span>
            </div>
            {log.result && (
              <div style={{ color: 'var(--muted)', marginTop: 2 }}>{log.result}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
