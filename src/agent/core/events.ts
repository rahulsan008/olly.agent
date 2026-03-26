import { createNanoEvents } from 'nanoevents';
import type { ToolCall, ToolResult } from './types';

type AgentEvents = {
  action_start: (payload: { call: ToolCall; timestamp: number }) => void;
  action_success: (payload: { call: ToolCall; result: ToolResult; timestamp: number }) => void;
  action_error: (payload: { call: ToolCall; error: string; timestamp: number }) => void;
};

export const agentEvents = createNanoEvents<AgentEvents>();
