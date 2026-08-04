/**
 * Prototype-recorder service — chained HMAC integrity (Phase 10 M5).
 *
 * `event_hash = HMAC-SHA256(server_key, payload || seq || prev_hash)`.
 *
 *   - The chain is per-session; events must be ingested in monotonic `seq` order.
 *   - Reordering is detected by chain mismatch — `prev_hash` references the
 *     previous event's `event_hash`. A reorder produces an inconsistent chain.
 *   - Key rotation uses a 7-day overlap window (`overlapUntil = rotatedAt + 7d`)
 *     so that in-flight events signed by the previous key still verify.
 *
 * The module deliberately uses only Node's `crypto.createHmac` for
 * portability — there is no FFI dependency.
 */

import { createHash, createHmac, randomBytes } from 'node:crypto';
import type {
  PrototypeEvent,
  IntegrityKey,
} from './types.js';
import {
  HmacKeyGenerationError,
  HmacVerificationError,
  ReorderDetectedError,
} from './dal.js';

/** 32 bytes = 256-bit HMAC key. */
export const HMAC_KEY_BYTES = 32;

/** 7-day overlap window for key rotation (spec). */
export const ROTATION_OVERLAP_MS = 7 * 24 * 60 * 60 * 1000;

/** Hard expiry after rotation (90 days, per `integrity_chain.expires_at`). */
export const KEY_HARD_EXPIRY_MS = 90 * 24 * 60 * 60 * 1000;

// ── Helpers ────────────────────────────────────────────────────────────

export function generateKeyHex(): string {
  try {
    return randomBytes(HMAC_KEY_BYTES).toString('hex');
  } catch (e) {
    throw new HmacKeyGenerationError((e as Error).message);
  }
}

export function hashStringHex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalizePayload(payload: Readonly<Record<string, unknown>>): string {
  // Deterministic canonicalization — keys sorted lexicographically.
  const sortedKeys = Object.keys(payload).sort();
  const parts: string[] = [];
  for (const k of sortedKeys) {
    const v = payload[k];
    parts.push(`${JSON.stringify(k)}:${stableStringify(v)}`);
  }
  return parts.join('|');
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * Compute `event_hash` from raw inputs.
 *
 * Exposed so that handlers / tests can confirm the chain math independently
 * of any in-memory state.
 */
export function computeEventHash(args: {
  readonly serverKeyHex: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly seq: number;
  readonly prevHash: string;
}): string {
  const { serverKeyHex, payload, seq, prevHash } = args;
  const canonical = canonicalizePayload(payload);
  const message = `${canonical}|seq:${seq}|prev:${prevHash}`;
  return createHmac('sha256', serverKeyHex).update(message).digest('hex');
}

// ── IntegrityChain ─────────────────────────────────────────────────────

export interface IntegrityChainState {
  /** Last seen `seq` per session — used to detect dropped/gap events. */
  readonly lastSeqBySession: Readonly<Record<string, number>>;
  /** Last seen `event_hash` per session. */
  readonly lastHashBySession: Readonly<Record<string, string>>;
}

export interface IntegrityChainOptions {
  readonly keys: IntegrityKey[];
  readonly clock?: () => number;
}

/**
 * The `IntegrityChain` is a pure helper — it never touches the DAL itself.
 * Callers supply the active key set; the chain computes the right `kid`,
 * `prevHash`, and `eventHash` and validates inbound events against the
 * current chain state.
 */
export class IntegrityChain {
  private keysById = new Map<string, IntegrityKey>();
  private state: IntegrityChainState = {
    lastSeqBySession: {},
    lastHashBySession: {},
  };
  private readonly clock: () => number;

  constructor(opts: IntegrityChainOptions) {
    this.clock = opts.clock ?? (() => Date.now());
    for (const k of opts.keys) {
      if (k.keyHex.length !== HMAC_KEY_BYTES * 2) {
        throw new HmacKeyGenerationError(`key ${k.kid} is not ${HMAC_KEY_BYTES} bytes`);
      }
      this.keysById.set(k.kid, k);
    }
  }

  /** All registered keys (for diagnostics + key-rotation admin endpoints). */
  listKeys(): readonly IntegrityKey[] {
    return Array.from(this.keysById.values()).sort((a, b) => a.rotatedAt - b.rotatedAt);
  }

  /**
   * Pick the primary key for new events. Prefers the most-recent key whose
   * `overlapUntil` is still in the future; falls back to the latest
   * non-expired key.
   */
  activeKey(now: number = this.clock()): IntegrityKey {
    const now2 = now;
    const candidates = this.listKeys();
    const stillAccepting = candidates.filter((k) => k.overlapUntil > now2 && k.expiresAt > now2);
    if (stillAccepting.length === 0) {
      const notExpired = candidates.filter((k) => k.expiresAt > now2);
      const latest = notExpired[notExpired.length - 1];
      if (!latest) {
        throw new HmacKeyGenerationError('no active HMAC key — operator must rotate');
      }
      return latest;
    }
    return stillAccepting[stillAccepting.length - 1]!;
  }

  /** Restore chain state (used when the service restarts). */
  hydrate(state: IntegrityChainState): void {
    this.state = state;
  }

  /** Snapshot for persistence — the service should write this on shutdown. */
  snapshot(): IntegrityChainState {
    return {
      lastSeqBySession: { ...this.state.lastSeqBySession },
      lastHashBySession: { ...this.state.lastHashBySession },
    };
  }

  /**
   * Verify an inbound event. Throws `ReorderDetectedError` if the chain
   * is broken or `HmacVerificationError` if the hash doesn't match.
   *
   * The `kid` lookup uses the explicit `kid` parameter (or the event's
   * own `kid` field, if present). For batch ingestion where events
   * were signed under different keys, pass the per-event `kid`.
   */
  verify(args: {
    readonly event: Omit<PrototypeEvent, 'kid'> & { readonly kid?: string };
    readonly kid?: string;
    readonly now?: number;
  }): { readonly verified: true; readonly key: IntegrityKey } {
    const now = args.now ?? this.clock();
    const ev = args.event;
    const kid = args.kid ?? ev.kid;
    if (!kid) throw new HmacVerificationError('missing kid');
    const key = this.keysById.get(kid);
    if (!key) throw new HmacVerificationError(`unknown kid ${kid}`);
    if (key.expiresAt <= now) throw new HmacVerificationError(`key ${key.kid} is expired`);

    const lastSeq = this.state.lastSeqBySession[ev.sessionId] ?? 0;
    const lastHash = this.state.lastHashBySession[ev.sessionId] ?? GENESIS_HASH;
    if (ev.seq !== lastSeq + 1) {
      throw new ReorderDetectedError(ev.sessionId, lastSeq + 1, ev.seq);
    }
    if (ev.prevHash !== lastHash) {
      throw new ReorderDetectedError(ev.sessionId, lastSeq, ev.seq);
    }
    const expected = computeEventHash({
      serverKeyHex: key.keyHex,
      payload: ev.payload,
      seq: ev.seq,
      prevHash: ev.prevHash,
    });
    if (expected !== ev.eventHash) {
      throw new HmacVerificationError(`event_hash mismatch at seq=${ev.seq}`);
    }
    return { verified: true, key };
  }

  /**
   * Commit a verified event to the chain state. Returns the
   * `prevHash` that the next event should carry.
   */
  commit(event: PrototypeEvent): void {
    this.state = {
      lastSeqBySession: {
        ...this.state.lastSeqBySession,
        [event.sessionId]: event.seq,
      },
      lastHashBySession: {
        ...this.state.lastHashBySession,
        [event.sessionId]: event.eventHash,
      },
    };
  }

  /**
   * Build a fully-signed event ready for persistence. Picks the active key,
   * derives `prevHash` from chain state, and computes `eventHash`.
   */
  buildEvent(args: {
    readonly tenantId: string;
    readonly deckId: string;
    readonly sessionId: string;
    readonly eventType: PrototypeEvent['eventType'];
    readonly payload: Readonly<Record<string, unknown>>;
    readonly clientFingerprint: string;
    readonly region: PrototypeEvent['region'];
    readonly createdAt?: number;
  }): PrototypeEvent {
    const key = this.activeKey();
    const lastSeq = this.state.lastSeqBySession[args.sessionId] ?? 0;
    const lastHash = this.state.lastHashBySession[args.sessionId] ?? GENESIS_HASH;
    const seq = lastSeq + 1;
    const createdAt = args.createdAt ?? this.clock();
    const eventHash = computeEventHash({
      serverKeyHex: key.keyHex,
      payload: args.payload,
      seq,
      prevHash: lastHash,
    });
    return {
      id: `pe-${createdAt.toString(36)}-${seq.toString(36)}-${randomBytes(4).toString('hex')}`,
      tenantId: args.tenantId,
      deckId: args.deckId,
      sessionId: args.sessionId,
      seq,
      eventType: args.eventType,
      payload: args.payload,
      prevHash: lastHash,
      eventHash,
      kid: key.kid,
      createdAt,
      clientFingerprint: args.clientFingerprint,
      region: args.region,
    };
  }

  /**
   * Build a new key (operator-only). The key is `kid`-tagged with
   * `rotatedAt`, `expiresAt`, and `overlapUntil` per the spec.
   */
  rotateKey(args: {
    readonly tenantId: string;
    readonly deckId: string;
    readonly kid: string;
    readonly now?: number;
  }): IntegrityKey {
    const now = args.now ?? this.clock();
    const key: IntegrityKey = {
      id: `ik-${args.kid}`,
      tenantId: args.tenantId,
      deckId: args.deckId,
      kid: args.kid,
      keyHex: generateKeyHex(),
      rotatedAt: now,
      expiresAt: now + KEY_HARD_EXPIRY_MS,
      overlapUntil: now + ROTATION_OVERLAP_MS,
    };
    this.keysById.set(key.kid, key);
    return key;
  }
}

/** Genesis prev-hash — the hash of the empty string. */
export const GENESIS_HASH = hashStringHex('');
