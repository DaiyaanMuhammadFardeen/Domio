/**
 * Suggestions service — shared types and errors (Phase 18 #182).
 *
 * Suggestion mode: structured CRDT-operation suggestions on deck content.
 */

// ---------------------------------------------------------------------------
// Domain types (aligned to migration 0072 DDL)
// ---------------------------------------------------------------------------

export type TargetType = 'element' | 'slide' | 'data_binding';
export type SuggestionStatus = 'open' | 'accepted' | 'rejected' | 'obsolete';
export type OpType = 'move' | 'resize' | 'restyle' | 'content' | 'data_binding' | 'theme';

export interface SuggestionOperation {
  readonly type: OpType;
  readonly params: Record<string, unknown>;
  readonly before_state: Record<string, unknown>;
  readonly after_state: Record<string, unknown>;
}

export interface Suggestion {
  readonly id: string;
  readonly workspace_id: string;
  readonly deck_id: string;
  readonly session_id: string;
  readonly author_id: string;
  readonly target_type: TargetType;
  readonly target_id: string;
  readonly operation: SuggestionOperation;
  readonly status: SuggestionStatus;
  readonly thread_id?: string;
  readonly created_at: Date;
  readonly updated_at: Date;
  readonly created_by?: string;
  readonly updated_by?: string;
  readonly resolved_at?: Date;
  readonly resolved_by?: string;
}

// ---------------------------------------------------------------------------
// Event envelope
// ---------------------------------------------------------------------------

export interface SuggestionEvent {
  readonly event_id: string;
  readonly event_type: string;
  readonly ts_ms: number;
  readonly workspace_id: string;
  readonly deck_id?: string;
  readonly actor_id: string;
  readonly actor_type: 'member' | 'guest' | 'agent' | 'system';
  readonly payload: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// EventEmitter interface
// ---------------------------------------------------------------------------

export interface SuggestionEventEmitter {
  publish(subject: string, payload: Record<string, unknown>): Promise<void>;
}

export const noopEmitter: SuggestionEventEmitter = {
  async publish(): Promise<void> { /* drop */ },
};

// ---------------------------------------------------------------------------
// Snapshot provider (CRDT sub-doc isolation)
// ---------------------------------------------------------------------------

export interface SnapshotProvider {
  getSnapshot(deckId: string, branchId?: string): Uint8Array;
}

// ---------------------------------------------------------------------------
// Brand-lock provider
// ---------------------------------------------------------------------------

export interface BrandLockProvider {
  isBrandLocked(targetId: string, op: SuggestionOperation): boolean;
}

export const defaultBrandLockProvider: BrandLockProvider = {
  isBrandLocked(): boolean { return false; },
};

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class SuggestionValidationError extends Error {
  readonly code: string;
  constructor(message: string, code: string = 'SUGGESTION_VALIDATION_ERROR') {
    super(message);
    this.name = 'SuggestionValidationError';
    this.code = code;
  }
}

export class SuggestionNotFoundError extends Error {
  readonly code = 'SUGGESTION_NOT_FOUND' as const;
  constructor(public readonly suggestionId: string) {
    super(`Suggestion not found: ${suggestionId}`);
    this.name = 'SuggestionNotFoundError';
  }
}

export class InvalidStatusTransitionError extends Error {
  readonly code = 'INVALID_STATUS_TRANSITION' as const;
  constructor(
    public readonly from: string,
    public readonly to: string,
  ) {
    super(`Invalid status transition: ${from} → ${to}`);
    this.name = 'InvalidStatusTransitionError';
  }
}

export class BrandLockError extends Error {
  readonly code = 'BRAND_LOCK_ERROR' as const;
  constructor(public readonly targetId: string) {
    super(`Cannot accept suggestion: target ${targetId} is brand-locked. Set break_brand_lock=true to override.`);
    this.name = 'BrandLockError';
  }
}

export class OpConflictError extends Error {
  readonly code = 'OP_CONFLICT' as const;
  constructor(message: string) {
    super(message);
    this.name = 'OpConflictError';
  }
}

export class FeatureDisabledError extends Error {
  readonly code = 'FEATURE_DISABLED' as const;
  constructor(public readonly flag: string) {
    super(`Feature disabled: ${flag}`);
    this.name = 'FeatureDisabledError';
  }
}
