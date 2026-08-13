/**
 * @domio/join-web — websocket client.
 *
 * Phase 16 W1. Browser-side client for the participant-ws-gateway.
 * Reads JSON envelopes from the server, emits them as typed events,
 * and offers a typed publish() for outbound messages.
 */

import type { AudienceEnvelope } from '@domio/protocol';

export interface WSClientOptions {
  readonly url: string;
  readonly sessionCode: string;
  readonly workspaceId: string;
  readonly participantId: string;
  readonly locale: string;
  readonly onMessage: (msg: AudienceEnvelope) => void;
  readonly onClose?: (code: number, reason: string) => void;
  readonly onOpen?: () => void;
  readonly reconnectMs?: number;
  readonly token?: string;
}

export interface WSClient {
  send(envelope: AudienceEnvelope): void;
  close(): void;
  readonly state: 'connecting' | 'open' | 'closed';
}

export function connect(opts: WSClientOptions): WSClient {
  let ws: WebSocket | null = null;
  let state: WSClient['state'] = 'connecting';
  let closed = false;
  const reconnect = opts.reconnectMs ?? 1500;

  const open = (): void => {
    if (closed) return;
    const url = new URL(opts.url);
    url.searchParams.set('session_code', opts.sessionCode);
    url.searchParams.set('workspace_id', opts.workspaceId);
    url.searchParams.set('locale', opts.locale);
    if (opts.token) url.searchParams.set('token', opts.token);
    ws = new WebSocket(url.toString());
    ws.onopen = () => {
      state = 'open';
      opts.onOpen?.();
      ws?.send(
        JSON.stringify({
          kind: 'hello',
          session_code: opts.sessionCode,
          workspace_id: opts.workspaceId,
          participant_id: opts.participantId,
          locale: opts.locale,
          ts_ms: Date.now(),
          idempotency_key: crypto.randomUUID(),
        }),
      );
    };
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as AudienceEnvelope;
        opts.onMessage(msg);
      } catch {
        // ignore malformed frames
      }
    };
    ws.onclose = (event) => {
      state = 'closed';
      opts.onClose?.(event.code, event.reason);
      if (!closed) setTimeout(open, reconnect);
    };
    ws.onerror = () => {
      ws?.close();
    };
  };

  open();

  return {
    send(envelope) {
      if (state === 'open' && ws) {
        ws.send(JSON.stringify(envelope));
      } else {
        // buffer or drop — minimal impl: drop for now
      }
    },
    close() {
      closed = true;
      ws?.close();
      state = 'closed';
    },
    get state() {
      return state;
    },
  };
}
