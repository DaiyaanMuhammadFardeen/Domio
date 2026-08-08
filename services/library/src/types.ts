/**
 * Library service — shared types and errors (Phase 18 Wave 3).
 *
 * Slide library + auto-update binding types.
 */

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export type LibraryScope = 'workspace' | 'org' | 'team';
export type EntryStatus = 'draft' | 'pending' | 'approved' | 'retired';
export type InsertMode = 'reference' | 'copy';
export type AutoUpdateMode = 'immediate' | 'scheduled' | 'manual' | 'frozen';

export interface SlideLibraryEntry {
  readonly id: string;
  readonly workspace_id: string;
  readonly scope: LibraryScope;
  readonly team_id?: string;
  readonly title: string;
  readonly description?: string;
  readonly tags: readonly string[];
  readonly owner_id: string;
  readonly approval_chain: Record<string, unknown>;
  readonly status: EntryStatus;
  readonly version_id: string;
  readonly superseded_by?: string;
  readonly last_reviewed_at?: Date;
  readonly created_at: Date;
  readonly updated_at: Date;
  readonly created_by: string;
  readonly updated_by: string;
}

export interface LibraryVersion {
  readonly id: string;
  readonly entry_id: string;
  readonly version_num: number;
  readonly slide_snapshot: Record<string, unknown>;
  readonly data_bindings: readonly Record<string, unknown>[];
  readonly brand_locked: boolean;
  readonly created_by: string;
  readonly created_at: Date;
}

export interface LibrarySnapshotInput {
  readonly slide_snapshot: Record<string, unknown>;
  readonly data_bindings?: readonly Record<string, unknown>[];
  readonly brand_locked?: boolean;
}

export interface AutoUpdateBinding {
  readonly id: string;
  readonly workspace_id: string;
  readonly consumer_deck_id: string;
  readonly consumer_slide_id: string;
  readonly library_entry_id: string;
  readonly pinned_version_id?: string;
  readonly mode: AutoUpdateMode;
  readonly schedule: Record<string, unknown>;
  readonly is_mandatory: boolean;
  readonly last_synced_at?: Date;
  readonly last_sync_status?: string;
  readonly created_at: Date;
  readonly updated_at: Date;
  readonly created_by: string;
  readonly updated_by: string;
}

// ---------------------------------------------------------------------------
// Event envelope
// ---------------------------------------------------------------------------

export interface LibraryEvent {
  readonly event_id: string;
  readonly event_type: string;
  readonly ts_ms: number;
  readonly workspace_id: string;
  readonly deck_id?: string;
  readonly actor_id: string;
  readonly actor_type: string;
  readonly payload: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// EventEmitter interface
// ---------------------------------------------------------------------------

export interface LibraryEventEmitter {
  publish(subject: string, payload: Record<string, unknown>): Promise<void>;
}

export const noopEmitter: LibraryEventEmitter = {
  async publish(): Promise<void> { /* drop */ },
};

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class LibraryValidationError extends Error {
  readonly code: string;
  constructor(message: string, code: string = 'LIBRARY_VALIDATION_ERROR') {
    super(message);
    this.name = 'LibraryValidationError';
    this.code = code;
  }
}

export class EntryNotFoundError extends Error {
  readonly code = 'ENTRY_NOT_FOUND' as const;
  constructor(public readonly entryId: string) {
    super(`Entry not found: ${entryId}`);
    this.name = 'EntryNotFoundError';
  }
}

export class VersionNotFoundError extends Error {
  readonly code = 'VERSION_NOT_FOUND' as const;
  constructor(public readonly versionId: string) {
    super(`Version not found: ${versionId}`);
    this.name = 'VersionNotFoundError';
  }
}

export class RetiredEntryError extends Error {
  readonly code = 'RETIRED_ENTRY' as const;
  constructor(public readonly entryId: string) {
    super(`Retired entry cannot be updated or become head: ${entryId}`);
    this.name = 'RetiredEntryError';
  }
}

export class SupersedeChainError extends Error {
  readonly code = 'SUPERSEDE_CHAIN_ERROR' as const;
  constructor(message: string) {
    super(message);
    this.name = 'SupersedeChainError';
  }
}

export class FeatureDisabledError extends Error {
  readonly code = 'FEATURE_DISABLED' as const;
  constructor(public readonly flag: string) {
    super(`Feature disabled: ${flag}`);
    this.name = 'FeatureDisabledError';
  }
}

export class BindingNotFoundError extends Error {
  readonly code = 'BINDING_NOT_FOUND' as const;
  constructor(public readonly bindingId: string) {
    super(`Auto-update binding not found: ${bindingId}`);
    this.name = 'BindingNotFoundError';
  }
}
