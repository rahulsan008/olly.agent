export { browserAgent, BrowserAgent } from './core/agent';
export { agentEvents } from './core/events';
export { executeTool, getExecutionLogs } from './core/executor';
export type { ToolCall, ToolResult } from './core/types';
export {
  addStep,
  beginStep,
  completeStep,
  markStepStuck,
  addRecoveryAttempt,
  detectLoopRisk,
  markLoopDetected,
  startTrace,
  getTrace,
  getTraceDetailed,
  getTraceState,
  clearTrace,
  updateShortTermMemory,
  markAction,
  getShortTermMemory,
  clearShortTermMemory,
  saveSelector,
  getSelector,
  saveSelectorForCurrentDomain,
  getSelectorForCurrentDomain,
  executeWithRetry
} from './core/files';
