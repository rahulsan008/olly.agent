import React from 'react';
import type { AgentState } from '../../shared/types';

interface Props { state: AgentState; onStop(): void; }

export function TaskStatus({ state, onStop }: Props) {
  if (!state.isRunning && !state.error) return null;

  const label = state.error
    ? state.error
    : state.phase === 'planning'
      ? 'Planning…'
      : `Step ${state.stepCount} · running…`;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '6px 12px', fontSize: 12,
      background: state.error ? 'rgba(127,30,30,0.4)' : 'rgba(40,40,35,0.9)',
      borderTop: `1px solid var(--border)`,
      color: state.error ? 'var(--danger)' : 'var(--muted)',
      flexShrink: 0
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        {state.isRunning && (
          <span style={{
            width: 7, height: 7, borderRadius: '50%',
            background: 'var(--accent)', display: 'inline-block',
            animation: 'pulse 1.4s ease-in-out infinite'
          }} />
        )}
        <span>{label}</span>
      </div>
      {state.isRunning && (
        <button onClick={onStop} style={{
          border: '1px solid #7f4545', borderRadius: 8,
          background: '#4b2a2a', color: '#ffe4e4',
          padding: '3px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer'
        }}>
          Stop
        </button>
      )}
    </div>
  );
}
