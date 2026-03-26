export type CompactTraceStep = [tool: string, query: string, status: 0 | 1];
export type CompactTraceEntry = CompactTraceStep | string;

const MAX_STEPS = 20;
const KEEP_RECENT = 10;

let trace: CompactTraceEntry[] = [];

function summarizeEntries(entries: CompactTraceEntry[]): string {
  const steps = entries.filter((entry): entry is CompactTraceStep => Array.isArray(entry));
  const successCount = steps.filter((step) => step[2] === 1).length;
  const failCount = steps.length - successCount;
  const tools = Array.from(new Set(steps.map((step) => step[0]))).slice(0, 5).join(', ');
  return `Summary: ${steps.length} steps (${successCount} success, ${failCount} fail). Tools: ${tools || 'n/a'}`;
}

export function addStep(tool: string, query: string, success: boolean): void {
  trace.push([tool, (query || '').trim().slice(0, 80), success ? 1 : 0]);

  if (trace.length <= MAX_STEPS) return;

  const recent = trace.slice(-KEEP_RECENT);
  const older = trace.slice(0, trace.length - KEEP_RECENT);
  trace = [summarizeEntries(older), ...recent];
}

export function getTrace(): CompactTraceEntry[] {
  return [...trace];
}

export function clearTrace(): void {
  trace = [];
}
