import { Replayer, type eventWithTime } from 'rrweb';
import type { ToolResult } from '../../core/types';
import { recordedEvents } from './state';

type ReplayArgs = {
  events?: eventWithTime[];
};

export async function run(args: ReplayArgs = {}): Promise<ToolResult> {
  const events = args.events ?? recordedEvents;
  if (!events.length) return { success: false, error: 'No events available for replay' };

  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.inset = '0';
  container.style.zIndex = '2147483647';
  container.style.background = '#fff';
  document.body.appendChild(container);

  try {
    const replayer = new Replayer(events, { root: container });
    replayer.play();
    return { success: true };
  } catch {
    container.remove();
    return { success: false, error: 'Failed to replay rrweb session' };
  }
}
