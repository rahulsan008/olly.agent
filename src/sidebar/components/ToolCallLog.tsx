import React, { useState } from 'react';
import type { ToolCallLog } from '../../shared/types';

export function ToolCallLog({ logs }: { logs: ToolCallLog[] }) {
  const [open, setOpen] = useState(false);
  if (!logs.length) return null;

  return (
    <div style={{ borderTop: '1px solid var(--border)', background: 'rgba(30,30,27,0.8)', flexShrink: 0 }}>
      <button onClick={() => setOpen(o => !o)} style={{
        width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '5px 12px', fontSize: 12, color: 'var(--muted)',
        background: 'transparent', border: 0, cursor: 'pointer'
      }}>
        <span>Tool calls ({logs.length})</span>
        <span>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <ul style={{ maxHeight: 130, overflowY: 'auto', padding: '0 12px 8px', margin: 0, listStyle: 'none', display: 'grid', gap: 5 }}>
          {logs.slice(-30).map(log => (
            <li key={log.id} style={{ fontSize: 11 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                  background: log.status === 'pending' ? '#facc15' : log.status === 'success' ? '#4ade80' : '#f87171'
                }} />
                <span style={{ fontFamily: 'monospace', color: 'var(--accent)' }}>{log.name}</span>
                <span style={{ color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {JSON.stringify(log.args).slice(0, 90)}
                </span>
              </div>
              {log.result && (
                <p style={{ margin: '1px 0 0 12px', color: 'var(--muted)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {log.result}
                </p>
              )}
              {log.debug && (
                <pre style={{
                  margin: '3px 0 0 12px',
                  color: '#94a3b8',
                  fontSize: 10,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word'
                }}>
                  {JSON.stringify(log.debug, null, 2)}
                </pre>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
