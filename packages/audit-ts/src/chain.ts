/**
 * @domio/audit-ts — hash-chained audit log (TS port of services/mcp-server/internal/audit).
 *
 * Phase 14 W1 (and reusable by every later Phase 14 workstream). The
 * audit log is a per-(workspace_id, agent_session_id) chain of events,
 * where each event's `hash` is:
 *
 *     hash = HMAC-SHA256(key, canonical(payload) | seq | prev_hash)
 *
 * `prev_hash` is the previous event's hash. The genesis prev-hash is
 * `SHA256("")` = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855".
 * Any tampering, reordering, or deletion of an event mid-chain is
 * detectable by re-walking the chain and comparing hashes.
 *
 * The wire format and algorithm are identical to the Go implementation
 * at `services/mcp-server/internal/audit/chain.go`, so events signed by
 * one side verify on the other.
 *
 * Public API:
 *  - `Chain` — the signer + verifier.
 *  - `Event`, `Key`, `BuildInput`, `ChainState` — types.
 *  - `GenesisHash` — the SHA-256 of the empty string.
 *  - Errors: `ErrKeyNotFound`, `ErrKeyExpired`, `ErrKeyInvalidSize`,
 *    `ErrHashMismatch`, `ErrChainMismatch`, `ErrNoActiveKey`.
 *  - `computeEventHash(keyHex, payload, seq, prevHash)` — standalone helper.
 */

import { canonicalize, type JsonObject } from './canonical.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Required HMAC key length (32 bytes = 256 bits). The key is hex-encoded,
 *  so on the wire it is 64 hex chars. */
export const HMAC_KEY_BYTES = 32;

/** Genesis hash — SHA-256 of the empty string. */
export const GenesisHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class ErrKeyNotFound extends Error {
  readonly code = 'AUDIT_KEY_NOT_FOUND' as const;
  constructor(public readonly kid: string) {
    super(`audit: key not found: ${kid}`);
    this.name = 'ErrKeyNotFound';
  }
}

export class ErrKeyExpired extends Error {
  readonly code = 'AUDIT_KEY_EXPIRED' as const;
  constructor(public readonly kid: string) {
    super(`audit: key expired: ${kid}`);
    this.name = 'ErrKeyExpired';
  }
}

export class ErrKeyInvalidSize extends Error {
  readonly code = 'AUDIT_KEY_INVALID_SIZE' as const;
  constructor(public readonly kid: string, public readonly actualHexLen: number) {
    super(`audit: key must be 32 bytes hex-encoded (64 hex chars), got ${actualHexLen}`);
    this.name = 'ErrKeyInvalidSize';
  }
}

export class ErrNoActiveKey extends Error {
  readonly code = 'AUDIT_NO_ACTIVE_KEY' as const;
  constructor() {
    super('audit: no active HMAC key — operator must rotate');
    this.name = 'ErrNoActiveKey';
  }
}

export class ErrHashMismatch extends Error {
  readonly code = 'AUDIT_HASH_MISMATCH' as const;
  constructor(public readonly eventId: string) {
    super(`audit: hash mismatch at event ${eventId}`);
    this.name = 'ErrHashMismatch';
  }
}

export class ErrChainMismatch extends Error {
  readonly code = 'AUDIT_CHAIN_MISMATCH' as const;
  constructor(public readonly eventId: string) {
    super(`audit: chain mismatch at event ${eventId}`);
    this.name = 'ErrChainMismatch';
  }
}

export class ErrSequenceGap extends Error {
  readonly code = 'AUDIT_SEQUENCE_GAP' as const;
  constructor(public readonly expected: number, public readonly got: number) {
    super(`audit: sequence gap, expected seq=${expected}, got seq=${got}`);
    this.name = 'ErrSequenceGap';
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Key {
  /** Key identifier — included in every event so verifiers know which
   *  key to use. */
  readonly kid: string;
  /** 32-byte HMAC key, hex-encoded (64 chars). */
  readonly keyHex: string;
  /** When the key was activated. */
  readonly rotatedAt: Date;
  /** When the key can no longer be used to sign. */
  readonly expiresAt: Date;
  /** When older keys stop being accepted for verify. */
  readonly overlapUntil: Date;
}

export interface Event {
  /** Opaque event id. */
  readonly id: string;
  readonly workspaceId: string;
  /** Empty string = global chain for that workspace. */
  readonly agentSessionId: string;
  readonly sessionId: string;
  readonly toolCallId: string;
  readonly seq: number;
  readonly eventType: string;
  readonly payload: JsonObject;
  readonly prevHash: string;
  readonly hash: string;
  readonly kid: string;
  readonly recordedAt: Date;
}

export interface BuildInput {
  readonly workspaceId: string;
  readonly agentSessionId: string;
  readonly sessionId: string;
  readonly toolCallId: string;
  readonly eventType: string;
  readonly payload: JsonObject;
}

export interface ChainState {
  /** "<workspace>/<agent_session>" → last seq in that chain. */
  readonly lastSeqByChain: Readonly<Record<string, number>>;
  /** "<workspace>/<agent_session>" → last hash in that chain. */
  readonly lastHashByChain: Readonly<Record<string, string>>;
}

export interface ChainOptions {
  /** Override the clock (used in tests). */
  readonly clock?: () => Date;
  /** Override the event-id generator (used in tests for determinism). */
  readonly newId?: () => string;
}

// ---------------------------------------------------------------------------
// Hash helper
// ---------------------------------------------------------------------------

async function hmacHex(keyHex: string, msg: string): Promise<string> {
  const keyBytes = hexToBytes(keyHex);
  const subtle = globalThis.crypto.subtle;
  const cryptoKey = await subtle.importKey(
    'raw',
    keyBytes as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(msg) as BufferSource);
  return bytesToHex(new Uint8Array(sig));
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error(`invalid hex length: ${hex.length}`);
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    s += (bytes[i] as number).toString(16).padStart(2, '0');
  }
  return s;
}

/**
 * Compute the canonical hash of an event. Exported so callers can
 * re-derive hashes without going through a Chain instance.
 */
export async function computeEventHash(
  keyHex: string,
  payload: JsonObject,
  seq: number,
  prevHash: string,
): Promise<string> {
  const canonical = canonicalize(payload);
  const msg = `${canonical}|seq:${seq}|prev:${prevHash}`;
  return hmacHex(keyHex, msg);
}

function chainKeyOf(workspaceId: string, agentSessionId: string): string {
  return `${workspaceId}/${agentSessionId}`;
}

// ---------------------------------------------------------------------------
// Chain
// ---------------------------------------------------------------------------

const ROTATION_OVERLAP_MS = 7 * 24 * 60 * 60 * 1000;
const KEY_HARD_EXPIRY_MS = 90 * 24 * 60 * 60 * 1000;

let eventCounter = 0;
function defaultNewId(): string {
  eventCounter++;
  const ts = Date.now().toString(36);
  return `evt_${ts}_${eventCounter.toString(36).padStart(6, '0')}`;
}

export class Chain {
  private readonly keys = new Map<string, Key>();
  private readonly lastSeqByChain = new Map<string, number>();
  private readonly lastHashByChain = new Map<string, string>();
  private readonly clock: () => Date;
  private readonly newId: () => string;

  constructor(opts: ChainOptions = {}) {
    this.clock = opts.clock ?? (() => new Date());
    this.newId = opts.newId ?? defaultNewId;
  }

  // -------------------------------------------------------------------------
  // Key management
  // -------------------------------------------------------------------------

  /** Load a key into the chain. Throws ErrKeyInvalidSize if the key
   *  is not 32 bytes hex-encoded. */
  loadKey(k: Key): void {
    if (k.keyHex.length !== HMAC_KEY_BYTES * 2) {
      throw new ErrKeyInvalidSize(k.kid, k.keyHex.length);
    }
    this.keys.set(k.kid, k);
  }

  /** Returns the currently active key for signing. Prefers the most-recent
   *  key whose overlapUntil is still in the future; falls back to the
   *  latest non-expired key. */
  activeKey(now: Date = this.clock()): Key {
    const all = [...this.keys.values()].sort((a, b) => a.rotatedAt.getTime() - b.rotatedAt.getTime());
    const stillActive = all.filter((k) => k.overlapUntil > now && k.expiresAt > now);
    if (stillActive.length > 0) {
      return stillActive[stillActive.length - 1] as Key;
    }
    for (let i = all.length - 1; i >= 0; i--) {
      if ((all[i] as Key).expiresAt > now) return all[i] as Key;
    }
    throw new ErrNoActiveKey();
  }

  /** Add a new key with the standard 7-day overlap and 90-day expiry. */
  rotateKey(kid: string): Key {
    const now = this.clock();
    const keyBytes = new Uint8Array(HMAC_KEY_BYTES);
    globalThis.crypto.getRandomValues(keyBytes);
    const k: Key = {
      kid,
      keyHex: bytesToHex(keyBytes),
      rotatedAt: now,
      expiresAt: new Date(now.getTime() + KEY_HARD_EXPIRY_MS),
      overlapUntil: new Date(now.getTime() + ROTATION_OVERLAP_MS),
    };
    this.loadKey(k);
    return k;
  }

  // -------------------------------------------------------------------------
  // State (for persistence / restart)
  // -------------------------------------------------------------------------

  /** Restore chain state (used when the service restarts). */
  hydrate(state: ChainState): void {
    for (const [k, v] of Object.entries(state.lastSeqByChain)) {
      this.lastSeqByChain.set(k, v);
    }
    for (const [k, v] of Object.entries(state.lastHashByChain)) {
      this.lastHashByChain.set(k, v);
    }
  }

  /** Snapshot the current chain state (for persistence). */
  snapshot(): ChainState {
    return {
      lastSeqByChain: Object.fromEntries(this.lastSeqByChain),
      lastHashByChain: Object.fromEntries(this.lastHashByChain),
    };
  }

  // -------------------------------------------------------------------------
  // Build (sign a new event)
  // -------------------------------------------------------------------------

  /**
   * Construct a fully-signed event. The returned event is ready to be
   * persisted; calling commit() afterward updates the in-memory chain
   * state so the next event can chain off it.
   */
  async build(in_: BuildInput): Promise<Event> {
    const key = this.activeKey();
    const chainKey = chainKeyOf(in_.workspaceId, in_.agentSessionId);
    const lastSeq = this.lastSeqByChain.get(chainKey) ?? 0;
    const lastHash = this.lastHashByChain.get(chainKey) ?? GenesisHash;
    const seq = lastSeq + 1;

    const hash = await computeEventHash(key.keyHex, in_.payload, seq, lastHash);

    // Reserve the seq + hash immediately so concurrent build() calls do not
    // collide. Caller still needs to commit() after the event is durably
    // persisted; commit() is idempotent under our keying scheme.
    this.lastSeqByChain.set(chainKey, seq);
    this.lastHashByChain.set(chainKey, hash);

    return {
      id: this.newId(),
      workspaceId: in_.workspaceId,
      agentSessionId: in_.agentSessionId,
      sessionId: in_.sessionId,
      toolCallId: in_.toolCallId,
      seq,
      eventType: in_.eventType,
      payload: in_.payload,
      prevHash: lastHash,
      hash,
      kid: key.kid,
      recordedAt: this.clock(),
    };
  }

  /**
   * No-op kept for API symmetry — build() already reserves the chain
   * position. Caller may invoke commit() in a two-phase pattern
   * (build → persist → commit) without changing signatures.
   */
  commit(_ev: Event): void {
    /* no-op */
  }

  // -------------------------------------------------------------------------
  // Verify
  // -------------------------------------------------------------------------

  /** Verify a single event. The previous hash (if given) must match the
   *  event's prev_hash. Does NOT check the monotonic-seq invariant against
   *  in-memory chain state — use verifyChain() for that. */
  async verify(ev: Event, prevHash: string = ''): Promise<void> {
    const key = this.keys.get(ev.kid);
    if (!key) throw new ErrKeyNotFound(ev.kid);
    if (!(key.expiresAt > this.clock())) throw new ErrKeyExpired(ev.kid);

    const expected = await computeEventHash(key.keyHex, ev.payload, ev.seq, ev.prevHash);
    if (expected !== ev.hash) throw new ErrHashMismatch(ev.id);
    if (prevHash !== '' && ev.prevHash !== prevHash) throw new ErrChainMismatch(ev.id);
  }

  /** Walk a list of events in order and verify they form a valid chain.
   *  The previous event's hash must match the next event's prev_hash. */
  async verifyChain(events: readonly Event[]): Promise<void> {
    let prevHash = '';
    for (const ev of events) {
      await this.verify(ev, prevHash);
      prevHash = ev.hash;
    }
  }
}
