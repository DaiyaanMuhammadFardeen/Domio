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
import type {
  AnnotationCommitInput,
  AnnotationCommitResult,
  AnnotationGeometry,
  AnnotationLayerRecord,
  AnnotationPromoteInput,
  AnnotationRollbackInput,
} from './types.js';
import { type AnnotationStore } from './store/store.js';
import type { AuditEmitter } from './audit/emit.js';
import type { IdempotencyStore } from './idempotency/index.js';
export interface AnnotationServiceOptions {
  readonly store: AnnotationStore;
  readonly audit: AuditEmitter;
  readonly idempotency?: IdempotencyStore | undefined;
  readonly clock?: (() => number) | undefined;
  readonly idGenerator?: (() => string) | undefined;
  readonly idempotencyTtlMs?: number | undefined;
}
export declare class AnnotationService {
  private readonly store;
  private readonly audit;
  private readonly idempotency;
  private readonly clock;
  private readonly idGen;
  private readonly idempotencyTtlMs;
  constructor(opts: AnnotationServiceOptions);
  /**
   * Append an annotation stroke. Returns the record and the post-bump
   * etag of the session row.
   */
  commit(
    input: AnnotationCommitInput,
    ctx: {
      actorId: string;
    },
  ): Promise<AnnotationCommitResult>;
  /** Presenter "undo" — deletes an ephemeral annotation. Saved overlays are
   *  immutable through this path. */
  rollback(
    input: AnnotationRollbackInput,
    ctx: {
      actorId: string;
    },
  ): Promise<void>;
  /** Promote an ephemeral annotation to a saved overlay attached to the slide. */
  promote(
    input: AnnotationPromoteInput,
    ctx: {
      actorId: string;
    },
  ): Promise<AnnotationLayerRecord>;
  /** Read-only fetch — used by the renderer to load all overlays. */
  listForSession(session_id: string, ephemeral: boolean): Promise<AnnotationLayerRecord[]>;
  /** Saved overlays attached to a slide — used by viewer/audience. */
  listSavedForSlide(slide_id: string): Promise<AnnotationLayerRecord[]>;
  /** Clear ephemeral overlays on session end. */
  onSessionEnded(session_id: string, workspace_id: string): Promise<void>;
  /** Decode a vector buffer into the canonical geometry. Used when
   *  accepting strokes over the realtime channel. */
  static decodeGeometry(_kind: AnnotationCommitInput['kind'], raw: unknown): AnnotationGeometry;
}
//# sourceMappingURL=service.d.ts.map
