import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { MessageBubble } from './MessageBubble';
import { PlanReview } from './PlanReview';
import { TaskStatus } from './TaskStatus';
import { ToolCallLog } from './ToolCallLog';

const EXAMPLES = [
  'Go to Instagram and like the first post',
  'Search Google for "best coffee shops"',
  'Fill out this form with test data',
  'Extract all product names and prices from this page'
];

const composerStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 16,
  background: 'rgba(45,45,39,0.95)',
  padding: 10,
  flexShrink: 0
};

export function ChatWindow() {
  const { messages, toolLogs, agentState, pendingPlan, setPendingPlan, setAgentState, addMessage, clearChat } = useStore();
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = () => {
    const task = input.trim();
    if (!task || agentState.isRunning) return;
    const isFirstMessage = messages.length === 0;
    setInput('');
    addMessage({ role: 'user', content: task });
    setAgentState({ isRunning: true, currentTask: task, stepCount: 0, error: null, phase: 'planning' });
    chrome.runtime.sendMessage({ type: 'RUN_TASK', task, firstMessage: isFirstMessage });
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const approvePlan = () => {
    chrome.runtime.sendMessage({ type: 'APPROVE_PLAN' }, () => {
      if (chrome.runtime.lastError) {
        setAgentState({ error: chrome.runtime.lastError.message, isRunning: false, phase: 'idle' });
        return;
      }
      setAgentState({ isRunning: true, phase: 'executing', stepCount: 0, error: null });
    });
    setPendingPlan(null);
  };

  const cancelPlan = () => {
    chrome.runtime.sendMessage({ type: 'CANCEL_PLAN' });
    setPendingPlan(null);
    setAgentState({ isRunning: false });
    addMessage({ role: 'assistant', content: 'Plan cancelled.' });
  };

  const stop = () => chrome.runtime.sendMessage({ type: 'STOP_TASK' });

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  };

  const canSend = !agentState.isRunning && !pendingPlan;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 10, padding: '10px 12px 12px' }}>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 2 }}>
        {messages.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginTop: 32, gap: 10 }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%',
              background: 'var(--accent)', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 20, fontWeight: 700
            }}>O</div>
            <p style={{ margin: 0, fontWeight: 600, color: 'var(--text)' }}>Olly Agent</p>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', maxWidth: 200 }}>
              Tell me what to do on this page and I'll plan it out before acting.
            </p>
            <div style={{ width: '100%', marginTop: 8, display: 'grid', gap: 6 }}>
              {EXAMPLES.map(ex => (
                <button key={ex} onClick={() => setInput(ex)} style={{
                  textAlign: 'left', padding: '8px 11px', borderRadius: 9,
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  color: 'var(--muted)', fontSize: 12, cursor: 'pointer'
                }}>
                  {ex}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map(m => <MessageBubble key={m.id} message={m} />)
        )}
        <div ref={bottomRef} />
      </div>

      {/* Plan review */}
      {pendingPlan && (
        <PlanReview plan={pendingPlan} onApprove={approvePlan} onCancel={cancelPlan} />
      )}

      {/* Tool log */}
      <ToolCallLog logs={toolLogs} />

      {/* Status */}
      <TaskStatus state={agentState} onStop={stop} />

      {/* Composer */}
      <div style={composerStyle}>
        <textarea
          ref={textareaRef}
          rows={1}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKey}
          disabled={!canSend}
          placeholder={pendingPlan ? 'Approve or cancel the plan first…' : 'How can I help you today?'}
          style={{
            width: '100%', resize: 'none', overflow: 'hidden',
            border: '1px solid var(--border)', borderRadius: 10,
            background: 'var(--surface)', color: 'var(--text)',
            fontSize: 14, padding: '9px 11px', outline: 'none',
            opacity: canSend ? 1 : 0.5, minHeight: 44, maxHeight: 120
          }}
        />
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            {agentState.phase === 'planning' ? 'Building plan…' : 'Ask before acting'}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={stop}
              disabled={!agentState.isRunning}
              style={{
                border: '1px solid #7f4545', borderRadius: 10,
                background: '#4b2a2a', color: '#ffe4e4',
                minWidth: 68, padding: '8px 12px', fontWeight: 600,
                fontSize: 13, cursor: 'pointer',
                opacity: agentState.isRunning ? 1 : 0.5
              }}
            >
              Stop
            </button>
            <button
              onClick={send}
              disabled={!input.trim() || !canSend}
              style={{
                border: 0, borderRadius: 10,
                background: 'var(--accent)', color: '#fff',
                minWidth: 68, padding: '8px 12px', fontWeight: 600,
                fontSize: 13, cursor: 'pointer',
                opacity: (!input.trim() || !canSend) ? 0.45 : 1
              }}
            >
              {agentState.isRunning ? '…' : 'Send'}
            </button>
          </div>
        </div>
        {messages.length > 0 && (
          <button onClick={clearChat} disabled={agentState.isRunning} style={{
            display: 'block', width: '100%', marginTop: 6, textAlign: 'center',
            fontSize: 11, color: 'var(--muted)', background: 'transparent',
            border: 0, cursor: 'pointer', opacity: agentState.isRunning ? 0.3 : 0.6
          }}>
            New chat
          </button>
        )}
      </div>
    </div>
  );
}
