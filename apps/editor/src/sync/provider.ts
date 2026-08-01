/**
 * WebSocket transport provider for the realtime gateway.
 *
 * Connects to `/v1/sync/{deckId}`, implements the frame codec (4-byte
 * big-endian length prefix + JSON-encoded protobuf bytes), heartbeat timer,
 * reconnect with jittered exponential backoff, and a typed event emitter.
 *
 * The transport is injectable — the MessageBus abstraction in tests swaps
 * the WebSocket for an in-memory fan-out.
 */

import {
  Hello,
  Welcome,
  Op,
  OpAck,
  Presence,
  PeerJoined,
  PeerLeft,
  BranchSwitch,
  Error as RtError,
  HLC,
  OpType,
  PresenceKind,
} from '@domio/api-client/gen/domio/realtime/v1/realtime_pb.js';
import { createBackoff } from './backoff.js';

// ----- Event types -----

export interface SyncEvents {
  welcome: (welcome: Welcome) => void;
  op: (op: Op) => void;
  opack: (ack: OpAck) => void;
  presence: (presence: Presence) => void;
  'peer-joined': (peer: PeerJoined) => void;
  'peer-left': (peer: PeerLeft) => void;
  'branch-switch': (sw: BranchSwitch) => void;
  error: (err: RtError) => void;
  offline: () => void;
  online: () => void;
}

type EventName = keyof SyncEvents;
type EventCallback<K extends EventName> = SyncEvents[K];

// ----- Minimal typed event emitter -----

class SyncEmitter {
  private readonly listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  on<K extends EventName>(event: K, cb: EventCallback<K>): () => void {
    const set = this.listeners.get(event) ?? new Set();
    const wrapped = cb as (...args: unknown[]) => void;
    set.add(wrapped);
    this.listeners.set(event, set);
    return () => {
      set.delete(wrapped);
    };
  }

  emit<K extends EventName>(event: K, ...args: Parameters<SyncEvents[K]>): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const cb of set) {
      cb(...args);
    }
  }
}

// ----- Wire envelope -----

/**
 * Discriminated union for raw decoded frames. The wire format is
 * JSON-stringified protobuf messages wrapped in an envelope:
 *
 * ```
 * { "t": "<typeName>", "d": <json-serialized-message> }
 * ```
 */
interface WireEnvelope {
  t: string;
  d: Record<string, unknown>;
}

// ----- Frame codec -----

/** Encode a message into the wire format: 4-byte BE length + JSON envelope. */
function encodeFrame(typeName: string, message: Record<string, unknown>): Uint8Array {
  const envelope: WireEnvelope = { t: typeName, d: message };
  const json = new TextEncoder().encode(JSON.stringify(envelope));
  const frame = new Uint8Array(4 + json.length);
  const view = new DataView(frame.buffer);
  view.setUint32(0, json.length, false); // big-endian
  frame.set(json, 4);
  return frame;
}

/** Stateful decoder that accumulates partial frames. */
class FrameDecoder {
  private buffer = new Uint8Array(0);

  feed(chunk: Uint8Array): WireEnvelope[] {
    this.buffer = concat(this.buffer, chunk);
    const frames: WireEnvelope[] = [];

    while (this.buffer.length >= 4) {
      const view = new DataView(this.buffer.buffer, this.buffer.byteOffset);
      const len = view.getUint32(0, false);
      if (this.buffer.length < 4 + len) break; // incomplete frame

      const jsonBytes = this.buffer.slice(4, 4 + len);
      this.buffer = this.buffer.slice(4 + len);

      try {
        const text = new TextDecoder().decode(jsonBytes);
        const parsed = JSON.parse(text) as WireEnvelope;
        if (parsed.t && parsed.d) {
          frames.push(parsed);
        }
      } catch {
        // skip malformed frames
      }
    }
    return frames;
  }

  reset(): void {
    this.buffer = new Uint8Array(0);
  }
}

// ----- Message reconstruction -----

function buildHlc(raw: Record<string, unknown>): HLC {
  return new HLC({
    physical: BigInt((raw['physical'] as number) ?? 0),
    logical: BigInt((raw['logical'] as number) ?? 0),
  });
}

function decodeMessage(envelope: WireEnvelope): SyncMessage | null {
  const d = envelope.d;
  switch (envelope.t) {
    case 'Welcome':
      return {
        kind: 'welcome',
        message: new Welcome({
          gatewayId: (d['gatewayId'] as string) ?? (d['gateway_id'] as string) ?? '',
          serverHlc: d['serverHlc'] || d['server_hlc'] ? buildHlc(d['serverHlc'] as Record<string, unknown> ?? d['server_hlc'] as Record<string, unknown>) : undefined,
          heartbeatIntervalMs: (d['heartbeatIntervalMs'] as number) ?? (d['heartbeat_interval_ms'] as number) ?? 5000,
          presenceBroadcast: (d['presenceBroadcast'] as boolean) ?? (d['presence_broadcast'] as boolean) ?? true,
          maxPayloadBytes: BigInt((d['maxPayloadBytes'] as number) ?? (d['max_payload_bytes'] as number) ?? 1_048_576),
        }),
      };
    case 'Op':
      return {
        kind: 'op',
        message: new Op({
          opId: (d['opId'] as string) ?? (d['op_id'] as string) ?? '',
          deckId: (d['deckId'] as string) ?? (d['deck_id'] as string) ?? '',
          branchId: (d['branchId'] as string) ?? (d['branch_id'] as string) ?? '',
          slideId: (d['slideId'] as string) ?? (d['slide_id'] as string) ?? '',
          authorId: (d['authorId'] as string) ?? (d['author_id'] as string) ?? '',
          hlc: d['hlc'] ? buildHlc(d['hlc'] as Record<string, unknown>) : undefined,
          parentHlc: d['parentHlc'] || d['parent_hlc'] ? buildHlc(d['parentHlc'] as Record<string, unknown> ?? d['parent_hlc'] as Record<string, unknown>) : undefined,
          payload: typeof d['payload'] === 'string' ? hexToBytes(d['payload'] as string) : new Uint8Array(0),
          clientClock: BigInt((d['clientClock'] as number) ?? (d['client_clock'] as number) ?? 0),
          opType: (d['opType'] as OpType) ?? (d['op_type'] as OpType) ?? OpType.YJS_UPDATE,
        }),
      };
    case 'OpAck':
      return {
        kind: 'opack',
        message: new OpAck({
          opId: (d['opId'] as string) ?? (d['op_id'] as string) ?? '',
          applied: (d['applied'] as boolean) ?? true,
          reason: (d['reason'] as string) ?? '',
          serverHlc: d['serverHlc'] || d['server_hlc'] ? buildHlc(d['serverHlc'] as Record<string, unknown> ?? d['server_hlc'] as Record<string, unknown>) : undefined,
        }),
      };
    case 'Presence':
      return {
        kind: 'presence',
        message: new Presence({
          actorId: (d['actorId'] as string) ?? (d['actor_id'] as string) ?? '',
          sessionId: (d['sessionId'] as string) ?? (d['session_id'] as string) ?? '',
          state: (d['state'] as Record<string, string>) ?? {},
          hlc: d['hlc'] ? buildHlc(d['hlc'] as Record<string, unknown>) : undefined,
          kind: (d['kind'] as PresenceKind) ?? PresenceKind.UPDATE,
        }),
      };
    case 'PeerJoined':
      return {
        kind: 'peer-joined',
        message: new PeerJoined({
          actorId: (d['actorId'] as string) ?? (d['actor_id'] as string) ?? '',
          sessionId: (d['sessionId'] as string) ?? (d['session_id'] as string) ?? '',
          branchId: (d['branchId'] as string) ?? (d['branch_id'] as string) ?? '',
          hlc: d['hlc'] ? buildHlc(d['hlc'] as Record<string, unknown>) : undefined,
        }),
      };
    case 'PeerLeft':
      return {
        kind: 'peer-left',
        message: new PeerLeft({
          actorId: (d['actorId'] as string) ?? (d['actor_id'] as string) ?? '',
          sessionId: (d['sessionId'] as string) ?? (d['session_id'] as string) ?? '',
          branchId: (d['branchId'] as string) ?? (d['branch_id'] as string) ?? '',
          hlc: d['hlc'] ? buildHlc(d['hlc'] as Record<string, unknown>) : undefined,
        }),
      };
    case 'BranchSwitch':
      return {
        kind: 'branch-switch',
        message: new BranchSwitch({
          actorId: (d['actorId'] as string) ?? (d['actor_id'] as string) ?? '',
          fromBranchId: (d['fromBranchId'] as string) ?? (d['from_branch_id'] as string) ?? '',
          toBranchId: (d['toBranchId'] as string) ?? (d['to_branch_id'] as string) ?? '',
          hlc: d['hlc'] ? buildHlc(d['hlc'] as Record<string, unknown>) : undefined,
        }),
      };
    case 'Error':
      return {
        kind: 'error',
        message: new RtError({
          code: (d['code'] as RtError['code']) ?? 0,
          message: (d['message'] as string) ?? '',
          retryable: (d['retryable'] as boolean) ?? false,
        }),
      };
    default:
      return null;
  }
}

type SyncMessage =
  | { kind: 'welcome'; message: Welcome }
  | { kind: 'op'; message: Op }
  | { kind: 'opack'; message: OpAck }
  | { kind: 'presence'; message: Presence }
  | { kind: 'peer-joined'; message: PeerJoined }
  | { kind: 'peer-left'; message: PeerLeft }
  | { kind: 'branch-switch'; message: BranchSwitch }
  | { kind: 'error'; message: RtError };

// ----- Helpers -----

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

/** Hex string to Uint8Array. */
function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.substring(i, i + 2), 16);
  }
  return bytes;
}

// ----- HLC helpers -----

function makeHlc(): HLC {
  return new HLC({
    physical: BigInt(Date.now()) * 1_000_000n,
    logical: 0n,
  });
}

/** Serialize a protobuf message to a JSON record for the wire. */
function protoToJson(msg: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(msg)) {
    if (k === 'toJson' || k === 'fromJson' || k === 'fromJsonString' || k === 'toBinary' || k === 'clone' || k === 'equals' || k === 'toObject') continue;
    if (typeof v === 'function') continue;
    if (v instanceof Uint8Array) {
      out[k] = Array.from(v).map((b) => b.toString(16).padStart(2, '0')).join('');
    } else if (typeof v === 'bigint') {
      out[k] = Number(v);
    } else if (v && typeof v === 'object' && 'physical' in v && 'logical' in v) {
      // HLC instance
      out[k] = { physical: Number((v as HLC).physical), logical: Number((v as HLC).logical) };
    } else {
      out[k] = v;
    }
  }
  return out;
}

// ----- Provider -----

export interface SyncProviderOptions {
  deckId: string;
  actorId: string;
  branchId?: string;
  sessionId?: string;
  /** Override the WebSocket factory (for testing). */
  wsFactory?: (url: string) => WebSocket;
  /** Override the realtime gateway URL. */
  rtgwUrl?: string;
}

export class SyncProvider {
  readonly events = new SyncEmitter();
  private readonly deckId: string;
  private readonly actorId: string;
  private readonly branchId: string;
  private readonly sessionId: string;
  private readonly wsFactory: (url: string) => WebSocket;
  private readonly rtgwUrl: string;
  private readonly backoff = createBackoff({ baseMs: 300, maxMs: 15_000 });
  private readonly decoder = new FrameDecoder();

  private ws: WebSocket | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatMs = 5_000;
  private missedHeartbeats = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _serverHlc: HLC | null = null;
  private _online = false;
  private closed = false;
  private _lastHlc: HLC | null = null;

  constructor(options: SyncProviderOptions) {
    this.deckId = options.deckId;
    this.actorId = options.actorId;
    this.branchId = options.branchId ?? 'main';
    this.sessionId = options.sessionId ?? crypto.randomUUID();
    this.wsFactory = options.wsFactory ?? ((url) => new WebSocket(url));
    this.rtgwUrl = options.rtgwUrl ?? this.resolveRtgwUrl();
  }

  // ----- Public API -----

  /** Connect to the gateway. */
  connect(): void {
    this.closed = false;
    this.backoff.reset();
    this.open();
  }

  /** Gracefully disconnect. */
  disconnect(): void {
    this.closed = true;
    this.clearTimers();
    this.ws?.close(1000, 'client disconnect');
    this.ws = null;
    this.setOnline(false);
  }

  /** Send an Op to the gateway. */
  sendOp(op: Op): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const json = protoToJson(op as unknown as Record<string, unknown>);
    this.ws.send(encodeFrame('Op', json));
    this._lastHlc = op.hlc ?? null;
  }

  /** Send a presence update. */
  sendPresence(state: Map<string, string>, kind: PresenceKind = PresenceKind.UPDATE): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const presence = new Presence({
      actorId: this.actorId,
      sessionId: this.sessionId,
      state: Object.fromEntries(state),
      hlc: this.clientHlc(),
      kind,
    });
    const json = protoToJson(presence as unknown as Record<string, unknown>);
    this.ws.send(encodeFrame('Presence', json));
  }

  /** Get the server HLC from the last Welcome. */
  getServerHlc(): HLC | null {
    return this._serverHlc;
  }

  /** Whether the connection is online. */
  get online(): boolean {
    return this._online;
  }

  /** Subscribe to an event. Returns an unsubscribe function. */
  on<K extends EventName>(event: K, cb: EventCallback<K>): () => void {
    return this.events.on(event, cb);
  }

  /** Get the current client HLC. */
  clientHlc(): HLC {
    if (this._lastHlc) {
      return new HLC({
        physical: BigInt(Date.now()) * 1_000_000n,
        logical: this._lastHlc.logical + 1n,
      });
    }
    return makeHlc();
  }

  // ----- Internals -----

  private resolveRtgwUrl(): string {
    if (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_RTGW_URL) {
      return process.env.NEXT_PUBLIC_RTGW_URL;
    }
    if (typeof window !== 'undefined') {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${proto}//${window.location.host}`;
    }
    return 'ws://localhost:8080';
  }

  private open(): void {
    const url = `${this.rtgwUrl}/v1/sync/${this.deckId}`;
    const ws = this.wsFactory(url);
    this.ws = ws;
    this.decoder.reset();

    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      this.backoff.reset();
      this.sendHello();
      this.startHeartbeat();
    };

    ws.onmessage = (event: MessageEvent) => {
      const data = event.data;
      if (!(data instanceof ArrayBuffer)) return;
      const raw = new Uint8Array(data);
      const frames = this.decoder.feed(raw);

      for (const frame of frames) {
        const decoded = decodeMessage(frame);
        if (!decoded) continue;

        switch (decoded.kind) {
          case 'welcome':
            this.handleWelcome(decoded.message);
            break;
          case 'op':
            this.events.emit('op', decoded.message);
            break;
          case 'opack':
            this.events.emit('opack', decoded.message);
            break;
          case 'presence':
            this.events.emit('presence', decoded.message);
            break;
          case 'peer-joined':
            this.events.emit('peer-joined', decoded.message);
            break;
          case 'peer-left':
            this.events.emit('peer-left', decoded.message);
            break;
          case 'branch-switch':
            this.events.emit('branch-switch', decoded.message);
            break;
          case 'error':
            this.events.emit('error', decoded.message);
            break;
        }
      }
    };

    ws.onclose = () => {
      this.handleDisconnect();
    };

    ws.onerror = () => {
      // onclose will fire after onerror
    };
  }

  private sendHello(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const hello = new Hello({
      actorId: this.actorId,
      deckId: this.deckId,
      branchId: this.branchId,
      sessionId: this.sessionId,
      capabilities: ['sync', 'presence'],
    });
    const json = protoToJson(hello as unknown as Record<string, unknown>);
    this.ws.send(encodeFrame('Hello', json));
  }

  private handleWelcome(welcome: Welcome): void {
    this._serverHlc = welcome.serverHlc ?? null;
    if (welcome.heartbeatIntervalMs > 0) {
      this.heartbeatMs = welcome.heartbeatIntervalMs;
      this.restartHeartbeat();
    }
    this.setOnline(true);
    this.events.emit('welcome', welcome);
  }

  private handleDisconnect(): void {
    this.clearTimers();
    this.setOnline(false);

    if (this.closed) return;

    const delay = this.backoff.next();
    this.reconnectTimer = setTimeout(() => {
      this.open();
    }, delay);
  }

  private startHeartbeat(): void {
    this.restartHeartbeat();
  }

  private restartHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.missedHeartbeats = 0;
    this.heartbeatTimer = setInterval(() => {
      this.missedHeartbeats++;
      if (this.missedHeartbeats >= 2) {
        this.setOnline(false);
      }
      // Send a presence ping
      this.sendPresence(new Map(), PresenceKind.UPDATE);
    }, this.heartbeatMs);
  }

  private setOnline(value: boolean): void {
    if (this._online === value) return;
    this._online = value;
    if (value) {
      this.events.emit('online');
    } else {
      this.events.emit('offline');
    }
  }

  private clearTimers(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
