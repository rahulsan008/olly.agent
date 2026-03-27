import type { eventWithTime } from '@rrweb/types';

export let stopRecorder: (() => void) | null = null;
export let recordedEvents: eventWithTime[] = [];

export function setStopRecorder(value: (() => void) | null): void {
  stopRecorder = value;
}

export function pushEvent(event: eventWithTime): void {
  recordedEvents.push(event);
}

export function resetEvents(): void {
  recordedEvents = [];
}
