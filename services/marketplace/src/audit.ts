/**
 * Self-contained marketplace audit recorder (Phase 19 Wave 1).
 *
 * Hash-chained audit log: HMAC-SHA256 over canonical(payload || seq || prev_hash).
 * Chain key: (workspace_id, event_kind) — each event_kind is an independent chain
 * within a workspace.
 *
 * This module is fully self-contained with no external dependencies.
 * It uses Node.js built-in `crypto` for HMAC-SHA256.
 */

import { createHmac, randomUUID } from 'crypto';
import type { AuditEvent, AuditActorType, AuditActorKind, AuditEventKind } from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** HMAC key id used for all Wave 1 marketplace audit events. */
export const AUDIT_KID = 'mk1';

/** HMAC secret key (in production, loaded from env/secrets manager). */
const HMAC_SECRET = process.env.MARKETPLACE_AUDIT_HMAC_SECRET ?? 'domio-marketplace-audit-dev-key';

/** Genesis prev_hash: SHA256 of empty string. */
export const GENESIS_HASH = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

// ---------------------------------------------------------------------------
// AuditRecorder interface
// ---------------------------------------------------------------------------

export interface AuditRecorder {
  /**
   * Record an audit event. Returns the fully-formed AuditEvent with
   * computed seq, prev_hash, and hash.
   */
  record(opts: {
    workspaceId: string;
    actorId: string;
    actorType: AuditActorType;
    actorKind: AuditActorKind;
    eventKind: AuditEventKind;
    eventType: string;
    payload: Record<string, unknown>;
  }): Promise<AuditEvent>;
}

// ---------------------------------------------------------------------------
// Store dependency (minimal)
// ---------------------------------------------------------------------------

export interface AuditStore {
  insertAuditEvent(event: AuditEvent): Promise<void>;
  getNextAuditSeq(workspaceId: string, eventKind: string): Promise<number>;
  getLastAuditHash(workspaceId: string, eventKind: string): Promise<string>;
}

// ---------------------------------------------------------------------------
// InMemoryAuditRecorder
// ---------------------------------------------------------------------------

/**
 * In-memory audit recorder. Computes hash chains locally and persists
 * via the provided {@link AuditStore}.
 */
export class InMemoryAuditRecorder implements AuditRecorder {
  private readonly store: AuditStore;

  constructor(store: AuditStore) {
    this.store = store;
  }

  async record(opts: {
    workspaceId: string;
    actorId: string;
    actorType: AuditActorType;
    actorKind: AuditActorKind;
    eventKind: AuditEventKind;
    eventType: string;
    payload: Record<string, unknown>;
  }): Promise<AuditEvent> {
    const seq = await this.store.getNextAuditSeq(opts.workspaceId, opts.eventKind);
    const prevHash = await this.store.getLastAuditHash(opts.workspaceId, opts.eventKind);

    const hash = computeHash(opts.payload, seq, prevHash);

    const event: AuditEvent = {
      id: randomUUID(),
      workspaceId: opts.workspaceId,
      actorId: opts.actorId,
      actorType: opts.actorType,
      actorKind: opts.actorKind,
      eventKind: opts.eventKind,
      eventType: opts.eventType,
      payload: opts.payload,
      seq,
      prevHash: prevHash || GENESIS_HASH,
      hash,
      kid: AUDIT_KID,
      recordedAt: new Date(),
    };

    await this.store.insertAuditEvent(event);
    return event;
  }
}

// ---------------------------------------------------------------------------
// Hash computation
// ---------------------------------------------------------------------------

/**
 * Compute HMAC-SHA256 over canonical(payload || seq || prev_hash).
 * Canonical form: JSON payload bytes + seq string + prev_hash string.
 */
export function computeHash(
  payload: Record<string, unknown>,
  seq: number,
  prevHash: string,
): string {
  const canonical = JSON.stringify(payload) + String(seq) + (prevHash || GENESIS_HASH);
  return createHmac('sha256', HMAC_SECRET).update(canonical, 'utf8').digest('hex');
}

/**
 * Verify that a recorded event's hash matches the expected computation.
 */
export function verifyHash(event: AuditEvent): boolean {
  const expected = computeHash(event.payload, event.seq, event.prevHash);
  return expected === event.hash;
}
