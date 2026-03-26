import type { ToolResult } from '../../core/types';
import { recordedEvents, setStopRecorder, stopRecorder } from './state';

export async function run(): Promise<ToolResult> {
  if (!stopRecorder) return { success: false, error: 'Recorder is not running' };

  stopRecorder();
  setStopRecorder(null);

  return {
    success: true,
    data: {
      events: recordedEvents
    }
  };
}
