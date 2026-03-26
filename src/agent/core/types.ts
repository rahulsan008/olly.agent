export type ToolResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

export type ToolRunner<TArgs = any, TData = unknown> = (
  args: TArgs
) => Promise<ToolResult<TData>>;

export type ToolCall<TArgs = any> = {
  tool: string;
  args: TArgs;
};

export type ExecutorLog = {
  tool: string;
  startedAt: number;
  endedAt: number;
  success: boolean;
  error?: string;
};
