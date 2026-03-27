export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface ToolCallLog {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: string;
  debug?: Record<string, unknown>;
  status: 'pending' | 'success' | 'error';
  timestamp: number;
}

export interface AgentState {
  isRunning: boolean;
  currentTask: string | null;
  stepCount: number;
  error: string | null;
  phase: 'idle' | 'planning' | 'executing';
}

export interface Plan {
  understanding: string;
  steps: string[];
  initialUrl: string | null;
  actions?: {
    tool: string;
    args: Record<string, unknown>;
    why?: string;
    check?: {
      tool: string;
      args: Record<string, unknown>;
    };
    alternates?: {
      tool: string;
      args: Record<string, unknown>;
      why?: string;
    }[];
  }[];
}

export interface LlmUsageEntry {
  id: string;
  source: string;
  model: string;
  timestamp: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedTokens?: number;
  estimatedCostUsd: number;
  status: 'success' | 'error';
  error?: string;
}

export interface LlmUsageSummary {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

export interface PageSnapshot {
  url: string;
  title: string;
  content: string;
  interactiveElements: InteractiveElement[];
}

export interface InteractiveElement {
  type: 'button' | 'input' | 'link' | 'select' | 'textarea';
  selector: string;
  text?: string;
  placeholder?: string;
  href?: string;
  value?: string;
}

export interface SubGoal {
  description: string;
  completionCriteria: string;
}
