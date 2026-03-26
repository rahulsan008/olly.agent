import React, { useEffect, useState } from 'react';
import { useStore } from '../store';

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 10,
  border: '1px solid var(--border)', background: 'var(--surface)',
  color: 'var(--text)', fontSize: 14, outline: 'none'
};

const btnStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px', borderRadius: 11, border: 0,
  background: 'var(--accent)', color: '#fff', fontWeight: 600,
  fontSize: 14, cursor: 'pointer'
};

export function Settings() {
  const { apiKey, setApiKey, setShowSettings } = useStore();
  const [draft, setDraft] = useState(apiKey ?? '');
  const [saved, setSaved] = useState(false);

  useEffect(() => { setDraft(apiKey ?? ''); }, [apiKey]);

  const save = () => {
    const v = draft.trim();
    chrome.runtime.sendMessage({ type: 'SAVE_API_KEY', apiKey: v });
    setApiKey(v);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <button onClick={() => setShowSettings(false)} style={{
          background: 'transparent', border: 0, color: 'var(--muted)',
          cursor: 'pointer', fontSize: 18, padding: 0, lineHeight: 1
        }}>←</button>
        <span style={{ fontWeight: 600, fontSize: 14 }}>Settings</span>
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        <div>
          <label style={{ display: 'block', fontSize: 11, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            OpenAI API Key
          </label>
          <input
            type="password"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && save()}
            placeholder="sk-…"
            style={inputStyle}
          />
          <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--muted)' }}>
            Stored locally. Never leaves your browser except to OpenAI.
          </p>
        </div>

        <button onClick={save} disabled={!draft.trim()} style={btnStyle}>
          {saved ? '✓ Saved' : 'Save Key'}
        </button>

        <div style={{ background: 'var(--surface)', borderRadius: 10, padding: 12, fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
          <p style={{ margin: '0 0 4px', fontWeight: 600, color: 'var(--text)' }}>About Olly</p>
          <p style={{ margin: 0 }}>Uses <span style={{ color: 'var(--accent)' }}>GPT-5.1</span> with vision + function calling to read, plan and act on any web page.</p>
          <p style={{ margin: '4px 0 0' }}>Get your key at <span style={{ color: 'var(--accent)' }}>platform.openai.com</span></p>
        </div>
      </div>
    </div>
  );
}
