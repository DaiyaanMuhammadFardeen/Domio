/**
 * @domio/annotation-engine — audit emitter.
 *
 * Wraps @domio/audit-ts Chain with the per-tenant HKDF key derivation
 * pattern. Mirrors services/presenter-session/src/audit/emit.ts.
 */
import { type JsonObject } from '@domio/audit-ts';
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
  emit(event: AnnotationAuditEvent): Promise<{
    seq: number;
    hash: string;
  }>;
  /** Verify the chain up to and including the given seq. */
  verify(seq?: number): Promise<
    | {
        ok: true;
      }
    | {
        ok: false;
        brokenAt: number;
      }
  >;
  /** Replay the chain — used for tests and migration. */
  load(): Promise<{
    seq: number;
    events: AnnotationAuditEvent[];
  }>;
}
export interface AuditEmitterOptions {
  /** Root key per environment. Per-tenant keys are derived via HKDF. */
  rootKey: string;
  /** Optional override for the agent session id used in the chain key. */
  agentSessionId?: string;
}
export declare class HashChainedAuditEmitter implements AuditEmitter {
  private readonly chain;
  private readonly rootKey;
  private readonly records;
  private readonly agentSessionId;
  /** Per-workspace cached kid → key hex (we materialise once and reuse). */
  private readonly tenantKeys;
  constructor(opts: AuditEmitterOptions);
  private keyFor;
  emit(event: AnnotationAuditEvent): Promise<{
    seq: number;
    hash: string;
  }>;
  verify(seq?: number): Promise<
    | {
        ok: true;
      }
    | {
        ok: false;
        brokenAt: number;
      }
  >;
  load(): Promise<{
    seq: number;
    events: AnnotationAuditEvent[];
  }>;
}
/** Convenience for tests — emit a stub event. */
export declare function describeAnnotationForAudit(a: AnnotationLayerRecord): JsonObject;
//# sourceMappingURL=emit.d.ts.map
