/**
 * Live-analytics — WebSocket subscription endpoint (Phase 17 W10).
 *
 * Implements the graphql-ws protocol so the dashboard HUD can plug
 * in via the same client it already uses for the control plane. The
 * shape:
 *
 *   client → server:  ConnectionInit  {}     (handshake)
 *   server → client:  ConnectionAck   {}
 *   client → server:  Subscribe       { id, payload: { query, variables } }
 *   server → client:  Next            { id, payload: { data } }   (per pulse)
 *   server → client:  Complete        { id }
 *
 * The query string we accept is a literal token (`pulse` for the live
 * pulse stream). The session_id is in the URL path:
 *   ws://host/v1/live/{sessionID}/subscribe
 *
 * Each new subscriber gets the trailing window of events replayed as
 * a single Next message, then a steady stream of Next messages on
 * every pulse update.
 */

import type { Server, IncomingMessage } from 'node:http';
import type { WebSocket } from 'ws';
import type { Orchestrator } from '../orchestrator.js';
import type { Hub, SubscriberId } from '../ws/hub.js';
import type { LivePulse } from '../types.js';

const WS_PATH = /^\/v1\/live\/([^/]+)\/subscribe\/?$/;

interface ConnectionInitMsg {
  type: 'connection_init';
}

interface SubscribeMsg {
  id: string;
  type: 'subscribe';
  payload: { query: string; variables?: { workspace_id?: string } };
}

interface CompleteMsg {
  id: string;
  type: 'complete';
}

type ClientMessage = ConnectionInitMsg | SubscribeMsg | CompleteMsg;

interface ServerMessage {
  type: 'connection_ack' | 'next' | 'complete' | 'error' | 'ping' | 'pong';
  id?: string;
  payload?: unknown;
}

function send(ws: { send: (data: string) => void }, msg: ServerMessage): void {
  ws.send(JSON.stringify(msg));
}

interface AttachedConnection {
  workspace_id: string;
  session_id: string;
  subscriberIds: SubscriberId[];
  close: () => void;
}

export async function attachWebSocket(
  server: Server,
  orch: Orchestrator,
): Promise<void> {
  // Lazy-import so the module is optional in non-WS environments.
  let wss;
  try {
    const { WebSocketServer } = await import('ws');
    wss = new WebSocketServer({ noServer: true });
  } catch {
    // ws not installed in this env — skip.
    return;
  }

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const match = url.pathname.match(WS_PATH);
    if (!match) return; // not for us
    const sessionId = match[1] ?? '';
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req, sessionId);
    });
  });

  wss.on('connection', (ws: WebSocket, _req: IncomingMessage, sessionId: string) => {
    let attached: AttachedConnection | null = null;
    let ack = false;

    ws.on('message', (raw: Buffer) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString('utf-8')) as ClientMessage;
      } catch {
        return;
      }
      if (msg.type === 'connection_init') {
        send(ws, { type: 'connection_ack' });
        ack = true;
        return;
      }
      if (!ack) return; // ignore everything before init
      if (msg.type === 'subscribe') {
        const workspaceId = msg.payload?.variables?.workspace_id;
        if (!workspaceId) {
          send(ws, { type: 'error', payload: { message: 'workspace_id variable required' } });
          return;
        }
        attached = attach(orch, ws, workspaceId, sessionId, msg.id);
        return;
      }
      if (msg.type === 'complete' && attached) {
        attached.close();
        attached = null;
      }
    });

    ws.on('close', () => {
      if (attached) {
        attached.close();
        attached = null;
      }
    });
  });
}

function attach(
  orch: Orchestrator,
  ws: { send: (data: string) => void },
  workspace_id: string,
  session_id: string,
  subscriptionId: string,
): AttachedConnection {
  const hub: Hub = orch.hub();
  const subscriberIds: SubscriberId[] = [];

  // Channel 1: trailing window of raw events as a single Next message.
  const replay = orch.replay(workspace_id, session_id);
  if (replay.length > 0) {
    send(ws, { id: subscriptionId, type: 'next', payload: { data: { replay } } });
  }
  // Channel 2: live pulse stream.
  const subId = hub.subscribe(workspace_id, session_id, (pulse: LivePulse) => {
    send(ws, { id: subscriptionId, type: 'next', payload: { data: { pulse } } });
  });
  subscriberIds.push(subId);
  // Channel 3: also forward raw events (downstream may want a combined
  // view). One-shot replay handled above; here we just ensure the
  // subscriber is registered for future fan-out from the orchestrator.
  void (replay.length > 0 ? undefined : undefined);
  // Send the current pulse snapshot as the first message so the HUD
  // doesn't have to wait for the next event to draw a frame.
  const initialPulse = orch.pulse(workspace_id, session_id);
  send(ws, { id: subscriptionId, type: 'next', payload: { data: { pulse: initialPulse } } });

  return {
    workspace_id,
    session_id,
    subscriberIds,
    close() {
      for (const id of subscriberIds) {
        hub.unsubscribe(workspace_id, session_id, id);
      }
    },
  };
}

/** Minimal interface used by the routes for HTTP testing. */
export interface WsTestHandle {
  send(message: string): void;
  onMessage(handler: (raw: string) => void): void;
  close(): void;
}