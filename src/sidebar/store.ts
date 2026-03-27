import { create } from 'zustand';
import type { ChatMessage, ToolCallLog, AgentState, Plan } from '../shared/types';

interface Store {
  messages: ChatMessage[];
  toolLogs: ToolCallLog[];
  agentState: AgentState;
  pendingPlan: Plan | null;
  apiKey: string | null;
  model: string;
  showSettings: boolean;
  activeTab: 'agent' | 'automate' | 'tools' | 'llm';

  addMessage(msg: Omit<ChatMessage, 'id' | 'timestamp'>): void;
  upsertToolLog(log: ToolCallLog): void;
  setAgentState(patch: Partial<AgentState>): void;
  setPendingPlan(plan: Plan | null): void;
  setApiKey(key: string | null): void;
  setModel(model: string): void;
  setShowSettings(show: boolean): void;
  setActiveTab(tab: 'agent' | 'automate' | 'tools' | 'llm'): void;
  clearChat(): void;
}

export const useStore = create<Store>(set => ({
  messages: [],
  toolLogs: [],
  agentState: { isRunning: false, currentTask: null, stepCount: 0, error: null, phase: 'idle' },
  pendingPlan: null,
  apiKey: null,
  model: 'gpt-5.4',
  showSettings: false,
  activeTab: 'agent',

  addMessage: msg =>
    set(s => ({ messages: [...s.messages, { ...msg, id: crypto.randomUUID(), timestamp: Date.now() }] })),

  upsertToolLog: log =>
    set(s => {
      const idx = s.toolLogs.findIndex(l => l.id === log.id);
      if (idx >= 0) { const next = [...s.toolLogs]; next[idx] = log; return { toolLogs: next }; }
      return { toolLogs: [...s.toolLogs, log] };
    }),

  setAgentState: patch =>
    set(s => ({ agentState: { ...s.agentState, ...patch } })),

  setPendingPlan: pendingPlan => set({ pendingPlan }),

  setApiKey: apiKey => set({ apiKey }),

  setModel: model => set({ model }),

  setShowSettings: showSettings => set({ showSettings }),
  setActiveTab: activeTab => set({ activeTab }),

  clearChat: () => set({ messages: [], toolLogs: [], pendingPlan: null,
    agentState: { isRunning: false, currentTask: null, stepCount: 0, error: null, phase: 'idle' } })
}));
