export type CompactTraceStep = [tool: string, query: string, status: 0 | 1];
export type CompactTraceEntry = CompactTraceStep | string;

export type TraceStepState = 'running' | 'completed' | 'stuck';

export type DetailedTraceStep = {
  id: string;
  tool: string;
  query: string;
  status: 0 | 1 | null;
  state: TraceStepState;
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  stuckAtMs?: number;
  error?: string;
  recoveryAttempts: string[];
  loopDetected?: boolean;
};

const MAX_STEPS = 20;
const KEEP_RECENT = 10;

let traceEnabled = true;
let traceStartedAt: number | null = null;
let compactTrace: CompactTraceEntry[] = [];
let detailedTrace: DetailedTraceStep[] = [];

function summarizeEntries(entries: CompactTraceEntry[]): string {
  const steps = entries.filter((entry): entry is CompactTraceStep => Array.isArray(entry));
  const successCount = steps.filter((step) => step[2] === 1).length;
  const failCount = steps.length - successCount;
  const tools = Array.from(new Set(steps.map((step) => step[0]))).slice(0, 5).join(', ');
  return `Summary: ${steps.length} steps (${successCount} success, ${failCount} fail). Tools: ${tools || 'n/a'}`;
}

function pushCompact(entry: CompactTraceEntry): void {
  compactTrace.push(entry);
  if (compactTrace.length <= MAX_STEPS) return;

  const recent = compactTrace.slice(-KEEP_RECENT);
  const older = compactTrace.slice(0, compactTrace.length - KEEP_RECENT);
  compactTrace = [summarizeEntries(older), ...recent];
}

function normalizeQuery(query: string): string {
  return (query || '').trim().slice(0, 80);
}

export function startTrace(goal = ''): void {
  traceEnabled = true;
  traceStartedAt = Date.now();
  compactTrace = [];
  detailedTrace = [];
  if (goal.trim()) {
    pushCompact(`Goal: ${goal.trim().slice(0, 120)}`);
  }
}

export function setTraceEnabled(enabled: boolean): void {
  traceEnabled = enabled;
}

export function addStep(tool: string, query: string, success: boolean): void {
  if (!traceEnabled) return;
  pushCompact([tool, normalizeQuery(query), success ? 1 : 0]);
}

export function beginStep(tool: string, query: string): string {
  if (!traceEnabled) return '';

  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  detailedTrace.push({
    id,
    tool,
    query: normalizeQuery(query),
    status: null,
    state: 'running',
    startedAt: Date.now(),
    recoveryAttempts: []
  });

  if (detailedTrace.length > 200) {
    detailedTrace = detailedTrace.slice(-200);
  }

  return id;
}

export function markStepStuck(stepId: string, thresholdMs = 2000): void {
  if (!stepId) return;
  const step = detailedTrace.find((entry) => entry.id === stepId);
  if (!step || step.state !== 'running') return;

  const now = Date.now();
  const elapsed = now - step.startedAt;
  if (elapsed >= thresholdMs) {
    step.state = 'stuck';
    step.stuckAtMs = elapsed;
  }
}

export function addRecoveryAttempt(stepId: string, label: string): void {
  if (!stepId) return;
  const step = detailedTrace.find((entry) => entry.id === stepId);
  if (!step) return;
  step.recoveryAttempts.push(label);
}

export function completeStep(stepId: string, success: boolean, error?: string): void {
  if (!stepId || !traceEnabled) return;
  const step = detailedTrace.find((entry) => entry.id === stepId);
  if (!step) return;

  const endedAt = Date.now();
  step.endedAt = endedAt;
  step.durationMs = endedAt - step.startedAt;
  step.status = success ? 1 : 0;
  step.error = error;

  if (step.state !== 'stuck') {
    step.state = 'completed';
  }

  pushCompact([step.tool, step.query, step.status]);
}

export function detectLoopRisk(tool: string, query: string, windowSize = 6, repeatThreshold = 3): boolean {
  const key = `${tool}|${normalizeQuery(query)}`;
  const recent = detailedTrace.slice(-windowSize);
  const matches = recent.filter((entry) => `${entry.tool}|${entry.query}` === key);
  const failOrStuck = matches.filter((entry) => entry.status === 0 || entry.state === 'stuck').length;
  return failOrStuck >= repeatThreshold;
}

export function markLoopDetected(stepId: string): void {
  if (!stepId) return;
  const step = detailedTrace.find((entry) => entry.id === stepId);
  if (!step) return;
  step.loopDetected = true;
}

export function getTrace(): CompactTraceEntry[] {
  return [...compactTrace];
}

export function getTraceDetailed(): DetailedTraceStep[] {
  return detailedTrace.map((entry) => ({ ...entry, recoveryAttempts: [...entry.recoveryAttempts] }));
}

export function getTraceState(): { enabled: boolean; startedAt: number | null; runningCount: number } {
  return {
    enabled: traceEnabled,
    startedAt: traceStartedAt,
    runningCount: detailedTrace.filter((entry) => entry.state === 'running' || entry.state === 'stuck').length
  };
}

export function clearTrace(): void {
  compactTrace = [];
  detailedTrace = [];
  traceStartedAt = null;
}
