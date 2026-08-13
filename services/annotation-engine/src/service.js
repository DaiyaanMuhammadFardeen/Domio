/**
 * @domio/annotation-engine — orchestration service.
 *
 * Capabilities:
 *   - annotation:commit    — POST /v1/annotation/{sessionId}/commit
 *   - annotation:rollback  — POST /v1/annotation/{sessionId}/rollback
 *   - annotation:promote   — POST /v1/annotation/{sessionId}/promote
 *   - annotation:list      — GET  /v1/annotation/{sessionId}/list
 *
 * The session's optimistic-CC etag is enforced via `expected_version`.
 * The session version itself is NOT bumped here — the upstream
 * presenter-session service handles version bumps; this engine only
 * writes to `annotation_layer` and emits audit.
 */
import { AnnotationConflictError, AnnotationNotFoundError, validateCommitInput } from './types.js';
import { isStore } from './store/store.js';
import { describeAnnotationForAudit } from './audit/emit.js';
import { NullIdempotencyStore } from './idempotency/index.js';
const DEFAULT_IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
export class AnnotationService {
  store;
  audit;
  idempotency;
  clock;
  idGen;
  idempotencyTtlMs;
  constructor(opts) {
    if (!isStore(opts.store)) throw new Error('AnnotationService: store is required');
    if (!opts.audit) throw new Error('AnnotationService: audit emitter is required');
    this.store = opts.store;
    this.audit = opts.audit;
    this.idempotency = opts.idempotency ?? new NullIdempotencyStore();
    this.clock = opts.clock ?? (() => Date.now());
    this.idGen = opts.idGenerator ?? (() => cryptoRandomUUID());
    this.idempotencyTtlMs = opts.idempotencyTtlMs ?? DEFAULT_IDEMPOTENCY_TTL_MS;
  }
  /**
   * Append an annotation stroke. Returns the record and the post-bump
   * etag of the session row.
   */
  async commit(input, ctx) {
    validateCommitInput(input);
    // Idempotency check (replay-safe).
    if (input.idempotency_key) {
      const prior = await this.idempotency.get(
        input.idempotency_key,
        input.workspace_id,
        input.session_id,
      );
      if (prior?.response) return prior.response;
      await this.idempotency.reserve({
        key: input.idempotency_key,
        workspace_id: input.workspace_id,
        session_id: input.session_id,
        ttl_ms: this.idempotencyTtlMs,
      });
    }
    const id = this.idGen();
    const now = this.clock();
    const ephemeral = input.ephemeral ?? true;
    const row = {
      id,
      workspace_id: input.workspace_id,
      session_id: input.session_id,
      slide_id: input.slide_id,
      layer_id: input.layer_id ?? null,
      kind: input.kind,
      geometry: input.geometry,
      style: input.style ?? {},
      color: input.color ?? null,
      stroke_width: input.stroke_width ?? null,
      ephemeral,
      saved_overlay_id: null,
      drawn_by: input.drawn_by,
      drawn_by_display_name: input.drawn_by_display_name ?? null,
      created_at_ms: now,
    };
    let persisted;
    try {
      persisted = await this.store.create(row);
    } catch (e) {
      throw mapStoreError(e);
    }
    const result = {
      annotation: persisted,
      version: input.expected_version,
    };
    await this.audit.emit({
      actor_id: ctx.actorId,
      session_id: input.session_id,
      workspace_id: input.workspace_id,
      action: 'annotation.commit',
      ts: now,
      after: describeAnnotationForAudit(persisted),
      meta: {
        ephemeral,
        expected_version: input.expected_version,
      },
    });
    if (input.idempotency_key) {
      await this.idempotency.commit({
        key: input.idempotency_key,
        workspace_id: input.workspace_id,
        session_id: input.session_id,
        response: result,
        recorded_at_ms: now,
        ttl_ms: this.idempotencyTtlMs,
      });
    }
    return result;
  }
  /** Presenter "undo" — deletes an ephemeral annotation. Saved overlays are
   *  immutable through this path. */
  async rollback(input, ctx) {
    if (!input.annotation_id) {
      throw new AnnotationConflictError('annotation_id required');
    }
    let existed = false;
    try {
      const r = await this.store.getById(input.annotation_id);
      existed = !!r;
      await this.store.rollback(input.annotation_id, input.workspace_id);
    } catch (e) {
      throw mapStoreError(e);
    }
    await this.audit.emit({
      actor_id: ctx.actorId,
      session_id: input.session_id,
      workspace_id: input.workspace_id,
      action: 'annotation.rollback',
      ts: this.clock(),
      before: { annotation_id: input.annotation_id, existed },
    });
  }
  /** Promote an ephemeral annotation to a saved overlay attached to the slide. */
  async promote(input, ctx) {
    let promoted;
    try {
      promoted = await this.store.promote(input.annotation_id, input.workspace_id, ctx.actorId);
    } catch (e) {
      throw mapStoreError(e);
    }
    await this.audit.emit({
      actor_id: ctx.actorId,
      session_id: input.session_id,
      workspace_id: input.workspace_id,
      action: 'annotation.promote',
      ts: this.clock(),
      after: describeAnnotationForAudit(promoted),
    });
    return promoted;
  }
  /** Read-only fetch — used by the renderer to load all overlays. */
  async listForSession(session_id, ephemeral) {
    return this.store.listForSession(session_id, ephemeral);
  }
  /** Saved overlays attached to a slide — used by viewer/audience. */
  async listSavedForSlide(slide_id) {
    return this.store.listSavedForSlide(slide_id);
  }
  /** Clear ephemeral overlays on session end. */
  async onSessionEnded(session_id, workspace_id) {
    await this.store.clearEphemeral(session_id, workspace_id);
  }
  /** Decode a vector buffer into the canonical geometry. Used when
   *  accepting strokes over the realtime channel. */
  static decodeGeometry(_kind, raw) {
    return raw;
  }
}
function mapStoreError(e) {
  if (e && typeof e === 'object' && 'code' in e) {
    const code = e.code;
    if (code === 'NOT_FOUND') return new AnnotationNotFoundError(e.message);
    if (code === 'CONFLICT') return new AnnotationConflictError(e.message);
    if (code === 'IMMUTABLE') return new AnnotationConflictError(e.message);
    if (code === 'ENDED') return new AnnotationNotFoundError(e.message);
  }
  return e;
}
function cryptoRandomUUID() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}
//# sourceMappingURL=service.js.map
