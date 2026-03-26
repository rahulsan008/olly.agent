import React from 'react';
import type { Plan } from '../../shared/types';

interface Props {
  plan: Plan;
  onApprove(): void;
  onCancel(): void;
}

export function PlanReview({ plan, onApprove, onCancel }: Props) {
  return (
    <div style={{
      border: '1px solid var(--border)',
      background: 'rgba(39,39,34,0.98)',
      borderRadius: 14,
      padding: '12px 14px',
      margin: '0 12px',
      flexShrink: 0
    }}>
      <p style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
        Plan Ready
      </p>
      <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--muted)' }}>
        {plan.understanding}
      </p>

      <ol style={{ margin: '0 0 10px', paddingLeft: 18, display: 'grid', gap: 5 }}>
        {plan.steps.map((step, i) => (
          <li key={i} style={{ fontSize: 13, color: 'var(--text)' }}>{step}</li>
        ))}
      </ol>

      {plan.initialUrl && (
        <div style={{ marginBottom: 10 }}>
          <span style={{
            border: '1px solid var(--border)', borderRadius: 999,
            padding: '3px 9px', fontSize: 12, color: 'var(--muted)'
          }}>
            {plan.initialUrl}
          </span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onApprove} style={{
          border: 0, borderRadius: 11, background: 'var(--accent)', color: '#fff',
          fontWeight: 600, cursor: 'pointer', padding: '9px 14px', fontSize: 13,
          flex: 1
        }}
          onMouseOver={e => (e.currentTarget.style.background = 'var(--accent-h)')}
          onMouseOut={e => (e.currentTarget.style.background = 'var(--accent)')}
        >
          Approve &amp; Run
        </button>
        <button onClick={onCancel} style={{
          border: '1px solid var(--border)', borderRadius: 11, background: 'transparent',
          color: 'var(--text)', cursor: 'pointer', padding: '9px 14px', fontSize: 13
        }}>
          Cancel
        </button>
      </div>
    </div>
  );
}
