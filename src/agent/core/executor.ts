import { agentEvents } from './events';
import type { ExecutorLog, ToolCall, ToolResult } from './types';
import { toolRegistry } from '../tools';
import { addStep, markAction, saveSelectorForCurrentDomain } from './files';

const executionLogs: ExecutorLog[] = [];

export async function executeTool(call: ToolCall): Promise<ToolResult> {
  const startedAt = Date.now();
  agentEvents.emit('action_start', { call, timestamp: startedAt });

  const runner = toolRegistry[call.tool];
  if (!runner) {
    const error = `Unknown tool: ${call.tool}`;
    const endedAt = Date.now();
    executionLogs.push({ tool: call.tool, startedAt, endedAt, success: false, error });
    addStep(call.tool, String((call.args as Record<string, unknown>)?.query ?? ''), false);
    markAction(call.tool, false);
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
    const query = String((call.args as Record<string, unknown>)?.query ?? '');
    addStep(call.tool, query, result.success);
    markAction(call.tool, result.success);

    const selector = (result.data as { selector?: unknown } | undefined)?.selector;
    if (result.success && query && typeof selector === 'string' && selector.trim()) {
      await saveSelectorForCurrentDomain(query, selector);
    }

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
    addStep(call.tool, String((call.args as Record<string, unknown>)?.query ?? ''), false);
    markAction(call.tool, false);
    agentEvents.emit('action_error', { call, error: message, timestamp: endedAt });

    return { success: false, error: message };
  }
}

export function getExecutionLogs(): ExecutorLog[] {
  return [...executionLogs];
}
