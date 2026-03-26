import type { ToolCall, ToolResult } from './types';
import { executeTool } from './executor';

export class BrowserAgent {
  async runTool(call: ToolCall): Promise<ToolResult> {
    if (!call?.tool) return { success: false, error: 'Missing tool name' };
    return executeTool(call);
  }
}

export const browserAgent = new BrowserAgent();
