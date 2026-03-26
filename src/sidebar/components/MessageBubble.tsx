import React from 'react';
import ReactMarkdown from 'react-markdown';
import type { ChatMessage } from '../../shared/types';

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  return (
    <div
      style={{
        maxWidth: '92%',
        borderRadius: 12,
        padding: '10px 12px',
        border: '1px solid var(--border)',
        lineHeight: 1.45,
        fontSize: 14,
        whiteSpace: 'pre-wrap',
        marginLeft: isUser ? 'auto' : undefined,
        marginRight: isUser ? undefined : 'auto',
        background: isUser ? '#35352f' : '#24241f',
        color: 'var(--text)'
      }}
    >
      {isUser ? (
        <p style={{ margin: 0 }}>{message.content}</p>
      ) : (
        <div className="prose prose-sm max-w-none"
          style={{ color: 'var(--text)' } as React.CSSProperties}>
          <ReactMarkdown>{message.content}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}
