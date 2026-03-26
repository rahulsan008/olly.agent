import { record } from 'rrweb';
import type { ToolResult } from '../../core/types';
import { pushEvent, resetEvents, setStopRecorder, stopRecorder } from './state';

export async function run(): Promise<ToolResult> {
  if (stopRecorder) return { success: false, error: 'Recorder already running' };

  resetEvents();
  const stop = record({
    emit(event) {
      pushEvent(event);
    }
  });

  setStopRecorder(stop);
  return { success: true };
}
