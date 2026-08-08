/**
 * @domio/annotation-engine — audit emitter.
 *
 * Wraps @domio/audit-ts Chain with the per-tenant HKDF key derivation
 * pattern. Mirrors services/presenter-session/src/audit/emit.ts.
 */

import {
  Chain,
  type Event as AuditEvent,
  type JsonObject,
} from '@domio/audit-ts';
import { createHmac } from 'node:crypto';
import type { AnnotationLayerRecord } from '../types.js';

export type AnnotationAuditAction =
  | 'annotation.commit'
  | 'annotation.rollback'
  | 'annotation.promote';

export interface AnnotationAuditEvent {
  actor_id: string;
  session_id: string;
  workspace_id: string;
  action: AnnotationAuditAction;
  ts: number;
  before?: JsonObject;
  after?: JsonObject;
  meta?: JsonObject;
}

export interface AuditEmitter {
  emit(event: AnnotationAuditEvent): Promise<{ seq: number; hash: string }>;
  /** Verify the chain up to and including the given seq. */
  verify(seq?: number): Promise<{ ok: true } | { ok: false; brokenAt: number }>;
  /** Replay the chain — used for tests and migration. */
  load(): Promise<{ seq: number; events: AnnotationAuditEvent[] }>;
}

export interface AuditEmitterOptions {
  /** Root key per environment. Per-tenant keys are derived via HKDF. */
  rootKey: string;
  /** Optional override for the agent session id used in the chain key. */
  agentSessionId?: string;
}

function deriveKey(rootKey: string, workspaceId: string): Buffer {
  const salt = Buffer.alloc(32, 0);
  const prk = createHmac('sha256', salt).update(rootKey).digest();
  const info = `domio/annotation-engine/audit/v1:${workspaceId}`;
  let out = Buffer.alloc(0);
  let counter = 1;
  let prev = Buffer.alloc(0);
  while (out.length < 32) {
    prev = createHmac('sha256', prk)
      .update(Buffer.concat([prev, Buffer.from(info, 'utf8'), Buffer.from([counter++])]))
      .digest();
    out = Buffer.concat([out, prev]);
  }
  return out.subarray(0, 32);
}

function bytesToHex(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    s += (bytes[i] as number).toString(16).padStart(2, '0');
  }
  return s;
}

interface StoredAuditRecord {
  event: AnnotationAuditEvent;
  signed: AuditEvent;
}

export class HashChainedAuditEmitter implements AuditEmitter {
  private readonly chain: Chain;
  private readonly rootKey: string;
  private readonly records: StoredAuditRecord[] = [];
  private readonly agentSessionId: string;
  /** Per-workspace cached kid → key hex (we materialise once and reuse). */
  private readonly tenantKeys = new Map<string, string>();

  constructor(opts: AuditEmitterOptions) {
    this.rootKey = opts.rootKey;
    this.agentSessionId = opts.agentSessionId ?? 'annotation-engine-default';
    this.chain = new Chain();
  }

  private keyFor(workspace_id: string): string {
    const cached = this.tenantKeys.get(workspace_id);
    if (cached) return cached;
    const keyHex = bytesToHex(deriveKey(this.rootKey, workspace_id));
    this.tenantKeys.set(workspace_id, keyHex);
    return keyHex;
  }

  async emit(event: AnnotationAuditEvent): Promise<{ seq: number; hash: string }> {
    const kid = `annotation-engine-${event.workspace_id}`;
    if (!this.tenantKeys.has(event.workspace_id)) {
      // Lazily register the key on the chain.
      this.chain.loadKey({
        kid,
        keyHex: this.keyFor(event.workspace_id),
        rotatedAt: new Date(0),
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        overlapUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      });
    }
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
    try {
      const count = seq ?? this.records.length;
      const slice = this.records.slice(0, count).map((r) => r.signed);
      await this.chain.verifyChain(slice);
      return { ok: true };
    } catch {
      return { ok: false, brokenAt: 0 };
    }
  }

  async load(): Promise<{ seq: number; events: AnnotationAuditEvent[] }> {
    return {
      seq: this.records.length,
      events: this.records.map((r) => r.event),
    };
  }
}

/** Convenience for tests — emit a stub event. */
export function describeAnnotationForAudit(a: AnnotationLayerRecord): JsonObject {
  return {
    id: a.id,
    session_id: a.session_id,
    slide_id: a.slide_id,
    kind: a.kind,
    ephemeral: a.ephemeral,
    saved_overlay_id: a.saved_overlay_id,
    drawn_by: a.drawn_by,
  };
}