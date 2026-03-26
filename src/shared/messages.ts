import type { PageSnapshot, ToolCallLog, Plan } from './types';

// Sidebar → Background
export type SidebarToBackground =
  | { type: 'RUN_TASK'; task: string }
  | { type: 'RUN_TEMPLATE'; platform: string; action: string; count: number; commentText: string }
  | { type: 'RUN_TOOL_TEST'; tool: string; args: Record<string, unknown> }
  | { type: 'APPROVE_PLAN' }
  | { type: 'CANCEL_PLAN' }
  | { type: 'STOP_TASK' }
  | { type: 'SAVE_API_KEY'; apiKey: string }
  | { type: 'GET_API_KEY' }
  | { type: 'SAVE_MODEL'; model: string }
  | { type: 'GET_MODEL' };

// Background → Sidebar (via long-lived port)
export type BackgroundToSidebar =
  | { type: 'PLAN_READY'; plan: Plan }
  | { type: 'AGENT_MESSAGE'; content: string; isComplete: boolean }
  | { type: 'TOOL_CALLED'; log: ToolCallLog }
  | { type: 'TASK_COMPLETE'; summary: string }
  | { type: 'TASK_ERROR'; error: string }
  | { type: 'TASK_STOPPED' }
  | { type: 'API_KEY'; apiKey: string | null }
  | { type: 'MODEL'; model: string }
  | { type: 'STATUS_UPDATE'; isRunning: boolean; step: number; phase: 'planning' | 'executing' };

// Background → Content Script
export type BackgroundToContent =
  | { type: 'GET_PAGE_CONTENT' }
  | { type: 'CLICK_ELEMENT'; selector: string }
  | { type: 'TYPE_TEXT'; selector: string; text: string }
  | { type: 'SCROLL_PAGE'; direction: string; amount?: number }
  | { type: 'HIGHLIGHT_ELEMENT'; selector: string }
  | { type: 'EXTRACT_DATA'; selector: string }
  | { type: 'WAIT_FOR_ELEMENT'; selector: string; timeout?: number }
  | { type: 'PRESS_KEY'; key: string }
  | { type: 'CLICK_AT_COORDINATES'; x: number; y: number }
  | { type: 'SUBMIT_COMMENT' }
  | { type: 'RUN_AGENT_TOOL'; tool: string; args: Record<string, unknown> };

export interface ContentActionResult {
  success: boolean;
  data?: string;
  error?: string;
  snapshot?: PageSnapshot;
}
