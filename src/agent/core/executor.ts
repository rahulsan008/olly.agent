import { agentEvents } from './events';
import type { ExecutorLog, ToolCall, ToolResult } from './types';
import { toolRegistry } from '../tools';

const executionLogs: ExecutorLog[] = [];

export async function executeTool(call: ToolCall): Promise<ToolResult> {
  const startedAt = Date.now();
  agentEvents.emit('action_start', { call, timestamp: startedAt });

  const runner = toolRegistry[call.tool];
  if (!runner) {
    const error = `Unknown tool: ${call.tool}`;
    const endedAt = Date.now();
    executionLogs.push({ tool: call.tool, startedAt, endedAt, success: false, error });
    agentEvents.emit('action_error', { call, error, timestamp: endedAt });
    return { success: false, error };
  }

  try {
    const result = await runner(call.args);
    const endedAt = Date.now();

    executionLogs.push({
      tool: call.tool,
      startedAt,
      endedAt,
      success: result.success,
      error: result.error
    });

    if (result.success) {
      agentEvents.emit('action_success', { call, result, timestamp: endedAt });
    } else {
      agentEvents.emit('action_error', { call, error: result.error ?? 'Unknown error', timestamp: endedAt });
    }

    return result;
  } catch (error) {
    const endedAt = Date.now();
    const message = error instanceof Error ? error.message : 'Unexpected executor error';

    executionLogs.push({ tool: call.tool, startedAt, endedAt, success: false, error: message });
    agentEvents.emit('action_error', { call, error: message, timestamp: endedAt });

    return { success: false, error: message };
  }
}

export function getExecutionLogs(): ExecutorLog[] {
  return [...executionLogs];
}
