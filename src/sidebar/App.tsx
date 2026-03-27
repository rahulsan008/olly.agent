import React, { useEffect } from 'react';
import { useStore } from './store';
import { ChatWindow } from './components/ChatWindow';
import { TemplatePanel } from './components/TemplatePanel';
import { LlmUsagePanel } from './components/LlmUsagePanel';
import { ToolTesterPanel } from './components/ToolTesterPanel';
import { Settings } from './components/Settings';
import type { BackgroundToSidebar } from '../shared/messages';

const MODELS = ['gpt-5.4', 'gpt-5.1', 'gpt-5.1-mini', 'gpt-4o-mini'];

export function App() {
  const {
    showSettings, setShowSettings,
    model, setModel,
    addMessage, upsertToolLog,
    setAgentState, setPendingPlan,
    setApiKey, clearChat,
    activeTab, setActiveTab
  } = useStore();

  useEffect(() => {
    let active = true;
    let port: chrome.runtime.Port;

    const handleMessage = (msg: BackgroundToSidebar) => {
      switch (msg.type) {
        case 'PLAN_READY':
          if (useStore.getState().agentState.phase === 'executing') break;
          setPendingPlan(msg.plan);
          setAgentState({ phase: 'planning' });
          break;
        case 'AGENT_EVENT':
          if (msg.event === 'plan_generated') {
            addMessage({ role: 'assistant', content: 'Plan generated. Ready to execute.' });
          }
          break;
        case 'AGENT_MESSAGE':
          addMessage({ role: 'assistant', content: msg.content });
          if (msg.isComplete) setAgentState({ isRunning: false, phase: 'idle' });
          break;
        case 'TOOL_CALLED':
          upsertToolLog(msg.log);
          break;
        case 'TASK_COMPLETE':
          setAgentState({ isRunning: false, error: null, phase: 'idle', currentTask: null });
          addMessage({ role: 'assistant', content: msg.summary });
          break;
        case 'TASK_ERROR':
          setAgentState({ isRunning: false, error: msg.error, phase: 'idle', currentTask: null });
          addMessage({ role: 'assistant', content: `⚠️ ${msg.error}` });
          break;
        case 'TASK_STOPPED':
          setAgentState({ isRunning: false, phase: 'idle', currentTask: null });
          addMessage({ role: 'assistant', content: 'Task stopped.' });
          break;
        case 'STATUS_UPDATE':
          setAgentState({ isRunning: msg.isRunning, stepCount: msg.step, phase: msg.phase });
          break;
        case 'API_KEY':
          setApiKey(msg.apiKey);
          break;
        case 'MODEL':
          setModel(msg.model);
          break;
      }
    };

    const connect = () => {
      port = chrome.runtime.connect({ name: 'sidebar' });
      port.onMessage.addListener(handleMessage);
      port.onDisconnect.addListener(() => { if (active) setTimeout(connect, 200); });
    };
    connect();

    // Load stored settings
    chrome.runtime.sendMessage({ type: 'GET_API_KEY' }, res => {
      if (res?.apiKey) setApiKey(res.apiKey as string);
      else setShowSettings(true);
    });
    chrome.runtime.sendMessage({ type: 'GET_MODEL' }, res => {
      if (res?.model) setModel(res.model as string);
    });

    return () => { active = false; port?.disconnect(); };
  }, []);

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const m = e.target.value;
    setModel(m);
    chrome.runtime.sendMessage({ type: 'SAVE_MODEL', model: m });
  };

  if (showSettings) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <Settings />
      </div>
    );
  }

  const tabBtn = (tab: 'agent' | 'automate' | 'tools' | 'llm', label: string) => (
    <button
      onClick={() => setActiveTab(tab)}
      style={{
        flex: 1, padding: '7px 0', border: 'none', cursor: 'pointer', fontSize: 12,
        borderRadius: 7, fontWeight: activeTab === tab ? 600 : 400,
        background: activeTab === tab ? 'var(--accent)' : 'transparent',
        color: activeTab === tab ? '#fff' : 'var(--muted)',
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Topbar */}
      <header style={{
        display: 'flex', flexDirection: 'column', gap: 8,
        padding: '10px 14px 0',
        borderBottom: '1px solid var(--border)',
        background: 'rgba(20,20,18,0.55)',
        backdropFilter: 'blur(8px)',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          {activeTab === 'agent' && (
            <select
              value={model}
              onChange={handleModelChange}
              style={{
                maxWidth: 140, padding: '6px 8px', borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--surface)',
                color: 'var(--text)', fontSize: 12, cursor: 'pointer', outline: 'none'
              }}
            >
              {MODELS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          )}
          {activeTab === 'automate' && (
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Automate</span>
          )}
          {activeTab === 'tools' && (
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Tool Tester</span>
          )}
          {activeTab === 'llm' && (
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>LLM Usage</span>
          )}
          <div style={{ display: 'flex', gap: 6 }}>
            {activeTab === 'agent' && (
              <button onClick={clearChat} style={{
                border: '1px solid var(--border)', borderRadius: 7,
                background: 'transparent', color: 'var(--text)',
                padding: '5px 9px', fontSize: 11, cursor: 'pointer'
              }}>New Chat</button>
            )}
            <button onClick={() => setShowSettings(true)} style={{
              border: '1px solid var(--border)', borderRadius: 7,
              background: 'transparent', color: 'var(--text)',
              padding: '5px 9px', fontSize: 11, cursor: 'pointer'
            }}>API Key</button>
          </div>
        </div>

        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: 4, padding: '0 0 8px' }}>
          {tabBtn('agent', '🤖 Agent')}
          {tabBtn('automate', '⚡ Automate')}
          {tabBtn('tools', '🧪 Tools')}
          {tabBtn('llm', '🧠 LLM')}
        </div>
      </header>

      <main style={{ flex: 1, overflow: 'hidden' }}>
        {activeTab === 'agent' && <ChatWindow />}
        {activeTab === 'automate' && <TemplatePanel />}
        {activeTab === 'tools' && <ToolTesterPanel />}
        {activeTab === 'llm' && <LlmUsagePanel />}
      </main>
    </div>
  );
}
