/**
 * @domio/presenter-session — audit emission.
 *
 * Every state mutation emits a hash-chained audit event using
 * @domio/audit-ts. The audit log is the authoritative trail for who
 * changed what, when, and the before/after diff.
 *
 * The chain is per-(workspace, agent_session); concurrent writers serialize
 * via the underlying Postgres adapter (or an in-process lock in tests).
 *
 * Note: audit-ts's `Chain` keeps an internal map of `Key` objects (kid →
 * HMAC key). The presenter-session audit uses a single tenant-derived key
 * loaded on construction. The key derivation lives in `./key.ts`.
 */

import { Chain, type Event as AuditEvent, type JsonObject } from '@domio/audit-ts';
import { createHash } from 'crypto';
import type { PresenterSession } from '../types.js';

export type PresenterAuditAction =
  | 'session.start'
  | 'session.end'
  | 'session.advance'
  | 'session.annotate'
  | 'session.plan'
  | 'session.handover'
  | 'session.failover'
  | 'session.recap'
  | 'session.heartbeat';

export interface PresenterAuditEvent {
  actor_id: string;
  session_id: string;
  workspace_id: string;
  ts: number;
  action: PresenterAuditAction;
  before?: JsonObject | undefined;
  after?: JsonObject | undefined;
  /** Free-form metadata (e.g. user agent, IP, region). */
  meta?: JsonObject | undefined;
}

export interface StoredAuditRecord {
  /** Original PresenterAuditEvent (lightweight, used for replay/UI). */
  event: PresenterAuditEvent;
  /** Full signed event from audit-ts (used for verification). */
  signed: AuditEvent;
}

export interface AuditEmitter {
  emit(event: PresenterAuditEvent): Promise<{ seq: number; hash: string }>;
  /** Verify the chain up to and including the given seq. Returns
   *  `{ ok: true }` if every link matches. */
  verify(seq?: number): Promise<{ ok: true } | { ok: false; brokenAt: number }>;
  /** Replay the chain — used for tests and migration. */
  load(): Promise<{ seq: number; events: PresenterAuditEvent[] }>;
}

export class HashChainedAuditEmitter implements AuditEmitter {
  private readonly chain: Chain;
  private readonly records: StoredAuditRecord[] = [];
  private readonly keyId: string;

  constructor(args: {
    workspaceId: string;
    key: Uint8Array;
    keyId?: string;
    agentSessionId?: string;
  }) {
    this.chain = new Chain();
    this.keyId = args.keyId ?? `presenter-session-${args.workspaceId}`;
    // Load a 32-byte key derived from the supplied material. audit-ts takes
    // a hex-encoded key, so we hex-encode our raw bytes here.
    const keyHex = bytesToHex(args.key);
    this.chain.loadKey({
      kid: this.keyId,
      keyHex,
      rotatedAt: new Date(0),
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      overlapUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    });
    this.agentSessionId = args.agentSessionId ?? 'presenter-session-default';
  }

  private readonly agentSessionId: string;

  async emit(event: PresenterAuditEvent): Promise<{ seq: number; hash: string }> {
    const payload: JsonObject = {
      actor_id: event.actor_id,
      session_id: event.session_id,
      workspace_id: event.workspace_id,
      ts: event.ts,
      action: event.action,
      before: event.before ?? null,
      after: event.after ?? null,
      meta: event.meta ?? {},
    };
    const signed = await this.chain.build({
      workspaceId: event.workspace_id,
      agentSessionId: this.agentSessionId,
      sessionId: event.session_id,
      toolCallId: '',
      eventType: event.action,
      payload,
    });
    this.records.push({ event, signed });
    return { seq: signed.seq, hash: signed.hash };
  }

  async verify(seq?: number): Promise<{ ok: true } | { ok: false; brokenAt: number }> {
    // Walk only the events we have emitted. Because `chain.build()` reserves
    // each event's seq + prevHash from the prior in-chain hash, the stored
    // `signed` records are already correctly chained — just replay them.
    try {
      const count = seq ?? this.records.length;
      const slice = this.records.slice(0, count).map((r) => r.signed);
      await this.chain.verifyChain(slice);
      return { ok: true };
    } catch (e) {
      return { ok: false, brokenAt: 0 };
    }
  }

  async load(): Promise<{ seq: number; events: PresenterAuditEvent[] }> {
    return {
      seq: this.records.length,
      events: this.records.map((r) => r.event),
    };
  }
}

function bytesToHex(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    s += (bytes[i] as number).toString(16).padStart(2, '0');
  }
  return s;
}

/** Construct a before/after diff for an advance. */
export function diffAdvance(
  before: PresenterSession,
  after: PresenterSession,
): {
  before: JsonObject;
  after: JsonObject;
} {
  return {
    before: {
      slide_id: before.state.slide_id,
      slide_index: before.state.slide_index,
      animation_frame_ms: before.state.animation_frame_ms,
      version: before.version,
    },
    after: {
      slide_id: after.state.slide_id,
      slide_index: after.state.slide_index,
      animation_frame_ms: after.state.animation_frame_ms,
      version: after.version,
    },
  };
}

/** Stable SHA-256 hash of an audit event for offline verification. */
export function hashAuditEvent(event: PresenterAuditEvent): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        actor_id: event.actor_id,
        session_id: event.session_id,
        workspace_id: event.workspace_id,
        ts: event.ts,
        action: event.action,
        before: event.before ?? null,
        after: event.after ?? null,
        meta: event.meta ?? {},
      }),
    )
    .digest('hex');
}
