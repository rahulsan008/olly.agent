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
