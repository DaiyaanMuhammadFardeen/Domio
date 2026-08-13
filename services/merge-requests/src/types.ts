/**
 * Merge request service — shared types and errors (Phase 18 W2).
 *
 * Types aligned to migration 0073_phase18_merge_requests.up.sql
 * and contracts/openapi/v1/collab.yaml schemas.
 */

// ---------------------------------------------------------------------------
// MergeRequest status
// ---------------------------------------------------------------------------

export type MergeRequestStatus = 'open' | 'approved' | 'merged' | 'closed' | 'conflict';

// ---------------------------------------------------------------------------
// SlideDiffLevel (from collab.yaml)
// ---------------------------------------------------------------------------

export type SlideDiffLevel = 'slide' | 'element' | 'data_binding';

// ---------------------------------------------------------------------------
// SlideDiff (row in slide_diff table)
// ---------------------------------------------------------------------------

export interface SlideDiff {
  readonly id: string;
  readonly workspace_id: string;
  readonly mr_id: string;
  readonly base_version_id: string;
  readonly target_version_id: string;
  readonly source_version_id: string;
  readonly slide_diffs: SlideDiffEntry[];
  readonly binding_diffs: BindingDiffEntry[];
  readonly computed_at: Date;
}

// ---------------------------------------------------------------------------
// SlideDiffEntry — per-slide diff (JSONB in slide_diffs column)
// ---------------------------------------------------------------------------

export type ChangeType = 'added' | 'removed' | 'modified';

export interface SlideDiffEntry {
  readonly slide_id: string;
  readonly change_type: ChangeType;
  readonly before: Record<string, unknown> | null;
  readonly after: Record<string, unknown> | null;
  readonly element_diffs: ElementDiffEntry[];
}

export interface ElementDiffEntry {
  readonly element_id: string;
  readonly path: string;
  readonly change_type: ChangeType;
  readonly source_value: unknown;
  readonly target_value: unknown;
  readonly base_value: unknown;
  readonly is_conflict: boolean;
}

// ---------------------------------------------------------------------------
// BindingDiffEntry — per-binding diff (JSONB in binding_diffs column)
// ---------------------------------------------------------------------------

export interface BindingDiffEntry {
  readonly binding_id: string;
  readonly change_type: ChangeType;
  readonly before: Record<string, unknown> | null;
  readonly after: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// MergeRequest
// ---------------------------------------------------------------------------

export interface MergeRequest {
  readonly id: string;
  readonly workspace_id: string;
  readonly deck_id: string;
  readonly source_branch: string;
  readonly target_branch: string;
  readonly title: string;
  readonly description: string | null;
  readonly author_id: string;
  readonly status: MergeRequestStatus;
  readonly diff_id: string | null;
  readonly created_at: Date;
  readonly updated_at: Date;
  readonly created_by: string | null;
  readonly updated_by: string | null;
  readonly merged_at: Date | null;
  readonly merged_by: string | null;
  readonly merge_commit_id: string | null;
}

// ---------------------------------------------------------------------------
// MergeRequestInput (from OpenAPI)
// ---------------------------------------------------------------------------

export interface MergeRequestInput {
  readonly source_branch: string;
  readonly target_branch: string;
  readonly title: string;
  readonly description?: string | null;
}

// ---------------------------------------------------------------------------
// ConflictResolution
// ---------------------------------------------------------------------------

export interface ConflictResolution {
  readonly slide_id: string;
  readonly resolution: 'theirs' | 'ours' | 'manual';
  readonly manual_value?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// DiffSnapshot (for 3-way diff computation)
// ---------------------------------------------------------------------------

export interface DiffSnapshot {
  readonly branch_id: string;
  readonly version_id: string;
  readonly deck: DeckSnapshot;
}

export interface DeckSnapshot {
  readonly slides: SlideSnapshot[];
}

export interface SlideSnapshot {
  readonly id: string;
  readonly semantic_id: string;
  readonly title: string;
  readonly notes: string;
  readonly elements: ElementSnapshot[];
}

export interface ElementSnapshot {
  readonly id: string;
  readonly type: string;
  readonly binding: Record<string, unknown> | null;
  readonly style: Record<string, unknown>;
  readonly [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// MergeRequestStore interface
// ---------------------------------------------------------------------------

export interface MergeRequestStore {
  insertMergeRequest(mr: MergeRequest): Promise<void>;
  updateMergeRequest(mr: MergeRequest): Promise<void>;
  getMergeRequest(id: string): Promise<MergeRequest | null>;
  listMergeRequestsByDeck(
    deckId: string,
    opts?: { status?: MergeRequestStatus },
  ): Promise<MergeRequest[]>;

  insertSlideDiff(diff: SlideDiff): Promise<void>;
  getSlideDiff(id: string): Promise<SlideDiff | null>;
  getSlideDiffByMrId(mrId: string): Promise<SlideDiff | null>;
  updateSlideDiff(
    id: string,
    patch: { slide_diffs: SlideDiffEntry[]; binding_diffs: BindingDiffEntry[] },
  ): Promise<void>;
}

// ---------------------------------------------------------------------------
// MergeRequestEventEmitter
// ---------------------------------------------------------------------------

export interface MergeRequestEventEmitter {
  publish(subject: string, payload: Record<string, unknown>): Promise<void>;
}

export const noopEmitter: MergeRequestEventEmitter = {
  async publish(): Promise<void> {
    /* drop */
  },
};

// ---------------------------------------------------------------------------
// Event envelope (must match contract schemas exactly)
// ---------------------------------------------------------------------------

export type ActorType = 'member' | 'guest' | 'agent' | 'system';

export interface MergeRequestEvent {
  readonly event_id: string;
  readonly event_type: string;
  readonly ts_ms: number;
  readonly workspace_id: string;
  readonly deck_id: string;
  readonly actor_id: string;
  readonly actor_type: ActorType;
  readonly payload: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// MergeValidators (injected dependency)
// ---------------------------------------------------------------------------

export interface ValidatorResult {
  readonly ok: boolean;
  readonly failures: string[];
}

export interface MergeValidator {
  (deckState: DeckSnapshot, diff: SlideDiff): Promise<ValidatorResult> | ValidatorResult;
}

export interface MergeValidators {
  readonly lint?: MergeValidator;
  readonly brand?: MergeValidator;
  readonly a11y?: MergeValidator;
}

export const noopValidators: MergeValidators = {};

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class FeatureDisabledError extends Error {
  readonly code = 'FEATURE_DISABLED' as const;
  constructor(public readonly flag: string) {
    super(`Feature disabled: ${flag}`);
    this.name = 'FeatureDisabledError';
  }
}

export class MergeRequestNotFoundError extends Error {
  readonly code = 'MERGE_REQUEST_NOT_FOUND' as const;
  constructor(public readonly id: string) {
    super(`Merge request ${id} not found`);
    this.name = 'MergeRequestNotFoundError';
  }
}

export class MergeRequestValidationError extends Error {
  readonly code = 'MERGE_REQUEST_VALIDATION_ERROR' as const;
  constructor(message: string) {
    super(message);
    this.name = 'MergeRequestValidationError';
  }
}

export class ConflictsUnresolvedError extends Error {
  readonly code = 'CONFLICTS_UNRESOLVED' as const;
  constructor(public readonly count: number) {
    super(`Merge request has ${count} unresolved conflict(s)`);
    this.name = 'ConflictsUnresolvedError';
  }
}

export class MergeValidationFailedError extends Error {
  readonly code = 'MERGE_VALIDATION_FAILED' as const;
  constructor(public readonly failures: string[]) {
    super(`Merge validation failed: ${failures.join('; ')}`);
    this.name = 'MergeValidationFailedError';
  }
}

export class MergeRequestConflictError extends Error {
  readonly code = 'MERGE_REQUEST_CONFLICT' as const;
  constructor(message: string) {
    super(message);
    this.name = 'MergeRequestConflictError';
  }
}

export class SlideDiffNotFoundError extends Error {
  readonly code = 'SLIDE_DIFF_NOT_FOUND' as const;
  constructor(public readonly mrId: string) {
    super(`Slide diff not found for merge request ${mrId}`);
    this.name = 'SlideDiffNotFoundError';
  }
}
