import { Replayer } from 'rrweb';
import type { eventWithTime } from '@rrweb/types';
import type { ToolResult } from '../../core/types';
import { recordedEvents } from './state';

type ReplayArgs = {
  events?: eventWithTime[];
  fullscreen?: boolean;
  autoCloseMs?: number;
};

type RRNode = {
  tagName?: string;
  attributes?: Record<string, string>;
  childNodes?: RRNode[];
};

function stripScriptNodes(node: RRNode | null | undefined): RRNode | null {
  if (!node) return null;
  const tag = (node.tagName ?? '').toLowerCase();
  if (tag === 'script' || tag === 'noscript' || tag === 'iframe' || tag === 'frame' || tag === 'object' || tag === 'embed') {
    return null;
  }

  if (node.attributes) {
    const cleaned: Record<string, string> = {};
    for (const [key, value] of Object.entries(node.attributes)) {
      const attr = key.toLowerCase();
      if (attr === 'autofocus') continue;
      if (attr.startsWith('on')) continue;
      if (attr === 'srcdoc') continue;
      cleaned[key] = value;
    }
    node.attributes = cleaned;
  }

  if (Array.isArray(node.childNodes)) {
    node.childNodes = node.childNodes
      .map((child) => stripScriptNodes(child))
      .filter((child): child is RRNode => child !== null);
  }
  return node;
}

function sanitizeReplayEvents(events: eventWithTime[]): eventWithTime[] {
  const cloned = structuredClone(events) as any[];

  for (const event of cloned) {
    if (event?.type === 2 && event?.data?.node) {
      event.data.node = stripScriptNodes(event.data.node);
    }

    if (event?.type === 3 && event?.data?.source === 0 && Array.isArray(event?.data?.adds)) {
      event.data.adds = event.data.adds
        .map((add: any) => ({ ...add, node: stripScriptNodes(add.node) }))
        .filter((add: any) => add.node != null);
    }
  }

  return cloned as eventWithTime[];
}

export async function run(args: ReplayArgs = {}): Promise<ToolResult> {
  const events = args.events ?? recordedEvents;
  if (!events.length) return { success: false, error: 'No events available for replay' };
  if (!events.some((event) => event.type === 2)) {
    return { success: false, error: 'Replay requires a full snapshot event. Run record_start first, then interact, then record_stop.' };
  }

  const protocol = window.location.protocol.toLowerCase();
  if (!protocol.startsWith('http')) {
    return { success: false, error: `Replay is only supported on http(s) pages, current protocol: ${protocol}` };
  }

  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.zIndex = '2147483647';
  container.style.background = '#fff';
  container.style.border = '1px solid rgba(0,0,0,0.2)';
  container.style.boxShadow = '0 12px 24px rgba(0,0,0,0.25)';
  container.style.borderRadius = '10px';
  container.style.overflow = 'hidden';
  container.style.display = 'flex';
  container.style.flexDirection = 'column';

  const fullscreen = args.fullscreen === true;
  if (fullscreen) {
    container.style.inset = '0';
    container.style.borderRadius = '0';
    container.style.border = '0';
  } else {
    container.style.left = '16px';
    container.style.bottom = '16px';
    container.style.width = 'min(920px, 68vw)';
    container.style.height = 'min(560px, 62vh)';
  }

  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.alignItems = 'center';
  header.style.justifyContent = 'space-between';
  header.style.padding = '8px 10px';
  header.style.background = '#111';
  header.style.color = '#fff';
  header.style.fontSize = '12px';
  header.textContent = 'rrweb replay';

  const closeButton = document.createElement('button');
  closeButton.textContent = 'Close';
  closeButton.style.border = '0';
  closeButton.style.borderRadius = '6px';
  closeButton.style.padding = '4px 8px';
  closeButton.style.cursor = 'pointer';
  closeButton.style.background = '#333';
  closeButton.style.color = '#fff';
  header.appendChild(closeButton);

  const root = document.createElement('div');
  root.style.flex = '1';
  root.style.background = '#fff';

  container.appendChild(header);
  container.appendChild(root);
  document.body.appendChild(container);

  let autoCloseTimer: number | null = null;
  const close = () => {
    if (autoCloseTimer !== null) window.clearTimeout(autoCloseTimer);
    document.removeEventListener('keydown', onKeyDown);
    container.remove();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') close();
  };
  closeButton.addEventListener('click', close);
  document.addEventListener('keydown', onKeyDown);

  try {
    const safeEvents = sanitizeReplayEvents(events);
    const replayer = new Replayer(safeEvents, {
      root,
      showWarning: false,
      triggerFocus: false
    });
    replayer.play();
    if ((args.autoCloseMs ?? 0) > 0) {
      autoCloseTimer = window.setTimeout(close, args.autoCloseMs);
    }
    return {
      success: true,
      data: {
        replayedEvents: safeEvents.length,
        replayUi: fullscreen ? 'fullscreen' : 'docked',
        closeHint: 'Use Close button or Esc'
      }
    };
  } catch {
    close();
    return { success: false, error: 'Failed to replay rrweb session' };
  }
}
