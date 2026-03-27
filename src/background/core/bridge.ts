import type { BackgroundToSidebar } from '../../shared/messages';
import type { BridgeEventName } from './types';

export type BridgeSend = (msg: BackgroundToSidebar) => void;

export function emitBridgeEvent(send: BridgeSend, event: BridgeEventName, payload?: Record<string, unknown>): void {
  send({ type: 'AGENT_EVENT', event, payload });
}
