import { agentEvents } from './events';
import type { ExecutorLog, ToolCall, ToolResult } from './types';
import { toolRegistry } from '../tools';
import {
  addRecoveryAttempt,
  beginStep,
  completeStep,
  detectLoopRisk,
  executeWithRetry,
  markAction,
  markLoopDetected,
  markStepStuck,
  saveSelectorForCurrentDomain
} from './files';

const executionLogs: ExecutorLog[] = [];

export async function executeTool(call: ToolCall): Promise<ToolResult> {
  const startedAt = Date.now();
  const query = String((call.args as Record<string, unknown>)?.query ?? '');
  const stepId = beginStep(call.tool, query);
  agentEvents.emit('action_start', { call, timestamp: startedAt });

  const runner = toolRegistry[call.tool];
  if (!runner) {
    const error = `Unknown tool: ${call.tool}`;
    const endedAt = Date.now();
    executionLogs.push({ tool: call.tool, startedAt, endedAt, success: false, error });
    completeStep(stepId, false, error);
    markAction(call.tool, false);
    agentEvents.emit('action_error', { call, error, timestamp: endedAt });
    return { success: false, error };
  }

  if (detectLoopRisk(call.tool, query)) {
    const error = `Loop detected for tool/query: ${call.tool}("${query}")`;
    const endedAt = Date.now();
    markLoopDetected(stepId);
    completeStep(stepId, false, error);
    executionLogs.push({ tool: call.tool, startedAt, endedAt, success: false, error });
    markAction(call.tool, false);
    agentEvents.emit('action_error', { call, error, timestamp: endedAt });
    return { success: false, error };
  }

  let stuckFlag = false;
  const stuckTimer = setTimeout(() => {
    stuckFlag = true;
    markStepStuck(stepId, 2000);
  }, 2000);

  const executeRaw = async (toolName: string, args: Record<string, unknown>): Promise<ToolResult> => {
    const nestedRunner = toolRegistry[toolName];
    if (!nestedRunner) return { success: false, error: `Unknown tool: ${toolName}` };
    return nestedRunner(args);
  };

  try {
    let result = await runner(call.args);
    clearTimeout(stuckTimer);

    if (!result.success || stuckFlag) {
      const recovered = await executeWithRetry(call.tool, call.args as Record<string, unknown>, executeRaw);
      for (const attempt of recovered.attempts) {
        addRecoveryAttempt(stepId, `${attempt.strategy}:${attempt.success ? 'ok' : 'fail'}`);
      }
      if (recovered.success) {
        result = recovered;
      } else if (!result.success) {
        result = recovered;
      }
    }

    const endedAt = Date.now();

    executionLogs.push({
      tool: call.tool,
      startedAt,
      endedAt,
      success: result.success,
      error: result.error
    });
    completeStep(stepId, result.success, result.error);
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
    clearTimeout(stuckTimer);
    const endedAt = Date.now();
    const message = error instanceof Error ? error.message : 'Unexpected executor error';

    executionLogs.push({ tool: call.tool, startedAt, endedAt, success: false, error: message });
    completeStep(stepId, false, message);
    markAction(call.tool, false);
    agentEvents.emit('action_error', { call, error: message, timestamp: endedAt });

    return { success: false, error: message };
  }
}

export function getExecutionLogs(): ExecutorLog[] {
  return [...executionLogs];
}
