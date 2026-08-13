/**
 * @domio/annotation-engine — audit emitter.
 *
 * Wraps @domio/audit-ts Chain with the per-tenant HKDF key derivation
 * pattern. Mirrors services/presenter-session/src/audit/emit.ts.
 */
import { Chain } from '@domio/audit-ts';
import { createHmac } from 'node:crypto';
function deriveKey(rootKey, workspaceId) {
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
function bytesToHex(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    s += bytes[i].toString(16).padStart(2, '0');
  }
  return s;
}
export class HashChainedAuditEmitter {
  chain;
  rootKey;
  records = [];
  agentSessionId;
  /** Per-workspace cached kid → key hex (we materialise once and reuse). */
  tenantKeys = new Map();
  constructor(opts) {
    this.rootKey = opts.rootKey;
    this.agentSessionId = opts.agentSessionId ?? 'annotation-engine-default';
    this.chain = new Chain();
  }
  keyFor(workspace_id) {
    const cached = this.tenantKeys.get(workspace_id);
    if (cached) return cached;
    const keyHex = bytesToHex(deriveKey(this.rootKey, workspace_id));
    this.tenantKeys.set(workspace_id, keyHex);
    return keyHex;
  }
  async emit(event) {
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
    const payload = {
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
  async verify(seq) {
    try {
      const count = seq ?? this.records.length;
      const slice = this.records.slice(0, count).map((r) => r.signed);
      await this.chain.verifyChain(slice);
      return { ok: true };
    } catch {
      return { ok: false, brokenAt: 0 };
    }
  }
  async load() {
    return {
      seq: this.records.length,
      events: this.records.map((r) => r.event),
    };
  }
}
/** Convenience for tests — emit a stub event. */
export function describeAnnotationForAudit(a) {
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
//# sourceMappingURL=emit.js.map
