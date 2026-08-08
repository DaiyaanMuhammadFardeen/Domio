/**
 * Library pure logic — entry + version operations (Phase 18 Wave 3).
 *
 * All functions are pure: they take state in, return new state out.
 * No side-effects, no store calls.
 */

import type {
  SlideLibraryEntry,
  LibraryVersion,
  LibrarySnapshotInput,
  EntryStatus,
  AutoUpdateBinding,
} from './types.js';
import {
  LibraryValidationError,
  RetiredEntryError,
  SupersedeChainError,
} from './types.js';

// ---------------------------------------------------------------------------
// IdGen / Clock (injectable)
// ---------------------------------------------------------------------------

export interface DomainOpts {
  readonly now: () => Date;
  readonly idGen: () => string;
}

// ---------------------------------------------------------------------------
// createEntryBody
// ---------------------------------------------------------------------------

export function createEntryBody(
  input: {
    workspace_id: string;
    scope: string;
    team_id?: string;
    title: string;
    description?: string;
    tags?: readonly string[];
    owner_id: string;
    approval_chain?: Record<string, unknown>;
    snapshot: LibrarySnapshotInput;
  },
  actorId: string,
  opts: DomainOpts,
): { entry: SlideLibraryEntry; version: LibraryVersion } {
  if (!input.title || input.title.trim().length === 0) {
    throw new LibraryValidationError('title is required and must be non-empty');
  }
  if (input.scope !== 'workspace' && input.scope !== 'org' && input.scope !== 'team') {
    throw new LibraryValidationError(`Invalid scope: ${input.scope}`);
  }
  if (!input.snapshot.slide_snapshot || typeof input.snapshot.slide_snapshot !== 'object') {
    throw new LibraryValidationError('slide_snapshot must be a non-null object');
  }

  const now = opts.now();
  const versionId = opts.idGen();

  const entryBase = {
    id: opts.idGen(),
    workspace_id: input.workspace_id,
    scope: input.scope as import('./types.js').LibraryScope,
    title: input.title.trim(),
    tags: input.tags ?? [],
    owner_id: input.owner_id,
    approval_chain: input.approval_chain ?? {},
    status: 'draft' as const,
    version_id: versionId,
    created_at: now,
    updated_at: now,
    created_by: actorId,
    updated_by: actorId,
  };

  const entry: SlideLibraryEntry = {
    ...entryBase,
    ...(input.team_id != null ? { team_id: input.team_id } : {}),
    ...(input.description != null ? { description: input.description } : {}),
  };

  const version: LibraryVersion = {
    id: versionId,
    entry_id: entry.id,
    version_num: 1,
    slide_snapshot: input.snapshot.slide_snapshot,
    data_bindings: input.snapshot.data_bindings ?? [],
    brand_locked: input.snapshot.brand_locked ?? false,
    created_by: actorId,
    created_at: now,
  };

  return { entry, version };
}

// ---------------------------------------------------------------------------
// addVersionBody
// ---------------------------------------------------------------------------

export function addVersionBody(
  entry: SlideLibraryEntry,
  snapshot: LibrarySnapshotInput,
  latestVersionNum: number,
  actorId: string,
  opts: DomainOpts,
): LibraryVersion {
  if (entry.status === 'retired') {
    throw new RetiredEntryError(entry.id);
  }
  if (!snapshot.slide_snapshot || typeof snapshot.slide_snapshot !== 'object') {
    throw new LibraryValidationError('slide_snapshot must be a non-null object');
  }

  const now = opts.now();
  const versionNum = latestVersionNum + 1;
  const versionId = opts.idGen();

  return {
    id: versionId,
    entry_id: entry.id,
    version_num: versionNum,
    slide_snapshot: snapshot.slide_snapshot,
    data_bindings: snapshot.data_bindings ?? [],
    brand_locked: snapshot.brand_locked ?? false,
    created_by: actorId,
    created_at: now,
  };
}

// ---------------------------------------------------------------------------
// publishEntryBody
// ---------------------------------------------------------------------------

export function publishEntryBody(
  entry: SlideLibraryEntry,
  latestVersionId: string,
  opts: DomainOpts,
): { status: EntryStatus; version_id: string; updated_at: Date } {
  if (entry.status !== 'draft' && entry.status !== 'pending') {
    throw new LibraryValidationError(`Cannot publish entry in status '${entry.status}'; must be draft or pending`);
  }

  return {
    status: 'approved',
    version_id: latestVersionId,
    updated_at: opts.now(),
  };
}

// ---------------------------------------------------------------------------
// retireEntryBody
// ---------------------------------------------------------------------------

export function retireEntryBody(
  entry: SlideLibraryEntry,
  supersededBy: string | undefined,
  allEntries: readonly SlideLibraryEntry[],
  opts: DomainOpts,
): { status: EntryStatus; superseded_by?: string; updated_at: Date } {
  if (entry.status === 'retired') {
    throw new LibraryValidationError('Entry is already retired');
  }

  // Cannot retire if it would leave no head:
  // Check if this entry is the only non-retired entry
  const otherActive = allEntries.filter(
    (e) => e.id !== entry.id && e.status !== 'retired',
  );
  if (otherActive.length === 0 && entry.status !== 'approved') {
    throw new LibraryValidationError('Cannot retire: would leave no active approved entry');
  }

  let resolvedSupersededBy: string | undefined = supersededBy;
  if (supersededBy) {
    const target = allEntries.find((e) => e.id === supersededBy);
    if (!target) {
      throw new SupersedeChainError(`Superseded-by target not found: ${supersededBy}`);
    }
    if (target.status === 'retired') {
      throw new SupersedeChainError('Superseded-by target must be a non-retired entry');
    }
  }

  return {
    status: 'retired' as const,
    updated_at: opts.now(),
    ...(resolvedSupersededBy != null ? { superseded_by: resolvedSupersededBy } : {}),
  };
}

// ---------------------------------------------------------------------------
// insertFromLibraryBody
// ---------------------------------------------------------------------------

export function insertFromLibraryBody(
  entry: SlideLibraryEntry,
  version: LibraryVersion,
  mode: 'reference' | 'copy',
): { version_id: string } {
  if (entry.status === 'retired') {
    throw new LibraryValidationError('Cannot insert from a retired entry');
  }
  if (mode === 'reference') {
    return { version_id: version.id };
  }
  // 'copy' — return the version_id so caller can duplicate the snapshot
  return { version_id: version.id };
}

// ---------------------------------------------------------------------------
// isBindingDue — auto-update
// ---------------------------------------------------------------------------

const SCHEDULED_WINDOW_MS = 60_000;

export function isBindingDue(
  binding: AutoUpdateBinding,
  nowMs: number,
): boolean {
  switch (binding.mode) {
    case 'immediate':
      return true;
    case 'scheduled':
      if (!binding.last_synced_at) return true;
      return nowMs - binding.last_synced_at.getTime() >= SCHEDULED_WINDOW_MS;
    case 'manual':
      return false;
    case 'frozen':
      return false;
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// shouldApply — auto-update
// ---------------------------------------------------------------------------

export interface ApplyDecision {
  readonly apply: boolean;
  readonly reason?: string;
}

export function shouldApply(
  binding: AutoUpdateBinding,
  latestVersionNum: number,
  appliedVersionNum?: number,
): ApplyDecision {
  if (binding.mode === 'frozen') {
    return { apply: false, reason: 'frozen' };
  }

  if (binding.last_sync_status === 'conflict') {
    return { apply: false, reason: 'consumer_conflict' };
  }

  if (binding.pinned_version_id) {
    // Only apply if pinned version differs from what was last applied
    // The caller must resolve pinned_version_id → version_num externally
    // Here we use a heuristic: if appliedVersionNum is undefined, we must apply
    if (appliedVersionNum === undefined) {
      return { apply: true, reason: 'pinned_first_sync' };
    }
    // If there's no info about which version_num is pinned, we compare via appliedVersionNum
    // Simplification: pinned bindings only apply on first sync or when explicitly triggered
    return { apply: false, reason: 'pinned_already_applied' };
  }

  // Follow-latest mode
  if (appliedVersionNum === undefined || appliedVersionNum < latestVersionNum) {
    return { apply: true };
  }

  return { apply: false, reason: 'already_up_to_date' };
}

// ---------------------------------------------------------------------------
// computeLatestVersionNum
// ---------------------------------------------------------------------------

export function computeLatestVersionNum(versions: readonly LibraryVersion[]): number {
  if (versions.length === 0) return 0;
  return Math.max(...versions.map((v) => v.version_num));
}
