/**
 * Merge request service (Phase 18 W2).
 *
 * Transport-agnostic orchestration of merge requests.
 * Depends on:
 *  - {@link MergeRequestStore}        — persistence.
 *  - {@link MergeRequestEventEmitter} — event emission (default: noopEmitter).
 *  - {@link MergeValidators}          — validation hooks (default: noopValidators).
 */

import { randomUUID } from 'crypto';
import { checkFeature, FEATURE_FLAGS } from './feature_flags.js';
import { computeDiff, isFastForward } from './diff.js';
import { validateMerge } from './validators.js';
import type {
  MergeRequest,
  MergeRequestInput,
  MergeRequestStatus,
  SlideDiff,
  SlideDiffEntry,
  SlideDiffLevel,
  ConflictResolution,
  MergeRequestEventEmitter,
  MergeValidators,
  DeckSnapshot,
  DiffSnapshot,
} from './types.js';
import {
  MergeRequestNotFoundError,
  MergeRequestValidationError,
  ConflictsUnresolvedError,
  SlideDiffNotFoundError,
} from './types.js';
import { noopEmitter, noopValidators } from './types.js';
import type { MergeRequestStore } from './store/store.js';

// ---------------------------------------------------------------------------
// Service options
// ---------------------------------------------------------------------------

export interface MergeRequestServiceOptions {
  readonly store: MergeRequestStore;
  readonly eventEmitter?: MergeRequestEventEmitter;
  readonly validators?: MergeValidators;
  /** Clock. Default Date.now. */
  readonly now?: () => Date;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class MergeRequestService {
  private readonly store: MergeRequestStore;
  private readonly emitter: MergeRequestEventEmitter;
  private readonly validators: MergeValidators;
  private readonly clock: () => Date;

  constructor(opts: MergeRequestServiceOptions) {
    if (!opts.store) throw new Error('MergeRequestService: store is required');
    this.store = opts.store;
    this.emitter = opts.eventEmitter ?? noopEmitter;
    this.validators = opts.validators ?? noopValidators;
    this.clock = opts.now ?? (() => new Date());
  }

  private idGen(): string {
    return randomUUID();
  }

  private now(): Date {
    return this.clock();
  }

  // -------------------------------------------------------------------------
  // createMergeRequest
  // -------------------------------------------------------------------------

  async createMergeRequest(
    input: MergeRequestInput,
    actorId: string,
    workspaceId: string,
    deckId: string,
    baseSnapshot: DeckSnapshot,
    sourceSnapshot: DeckSnapshot,
    targetSnapshot: DeckSnapshot,
    opts?: { base_version_id?: string; target_version_id?: string; source_version_id?: string },
  ): Promise<MergeRequest> {
    checkFeature(FEATURE_FLAGS.mergeRequest);

    if (!input.source_branch || !input.target_branch || !input.title) {
      throw new MergeRequestValidationError('source_branch, target_branch, and title are required');
    }
    if (input.source_branch === input.target_branch) {
      throw new MergeRequestValidationError('source and target branches must differ');
    }

    const now = this.now();
    const id = this.idGen();
    const baseVersionId = opts?.base_version_id ?? this.idGen();
    const targetVersionId = opts?.target_version_id ?? this.idGen();
    const sourceVersionId = opts?.source_version_id ?? this.idGen();

    // Build snapshots for diff computation
    const base: DiffSnapshot = { branch_id: 'base', version_id: baseVersionId, deck: baseSnapshot };
    const source: DiffSnapshot = {
      branch_id: input.source_branch,
      version_id: sourceVersionId,
      deck: sourceSnapshot,
    };
    const target: DiffSnapshot = {
      branch_id: input.target_branch,
      version_id: targetVersionId,
      deck: targetSnapshot,
    };

    // Check for fast-forward
    const ff = isFastForward(base, source, target);

    // Compute diff
    const diffResult = computeDiff({ base, source, target });

    // Insert slide_diff row
    const diffId = this.idGen();
    const slideDiff: SlideDiff = {
      id: diffId,
      workspace_id: workspaceId,
      mr_id: id,
      base_version_id: baseVersionId,
      target_version_id: targetVersionId,
      source_version_id: sourceVersionId,
      slide_diffs: diffResult.slide_diffs,
      binding_diffs: diffResult.binding_diffs,
      computed_at: now,
    };
    await this.store.insertSlideDiff(slideDiff);

    // Determine initial status
    let status: MergeRequestStatus = 'open';
    if (diffResult.has_conflicts) {
      status = 'conflict';
    } else if (ff) {
      status = 'open'; // Fast-forward auto-merge on merge
    }

    const mr: MergeRequest = {
      id,
      workspace_id: workspaceId,
      deck_id: deckId,
      source_branch: input.source_branch,
      target_branch: input.target_branch,
      title: input.title,
      description: input.description ?? null,
      author_id: actorId,
      status,
      diff_id: diffId,
      created_at: now,
      updated_at: now,
      created_by: actorId,
      updated_by: null,
      merged_at: null,
      merged_by: null,
      merge_commit_id: null,
    };

    await this.store.insertMergeRequest(mr);

    // Emit merge_request.opened event
    await this.emitter.publish('merge_request.opened', {
      event_id: this.idGen(),
      event_type: 'merge_request.opened',
      ts_ms: now.getTime(),
      workspace_id: workspaceId,
      deck_id: deckId,
      actor_id: actorId,
      actor_type: 'member',
      payload: {
        mr_id: id,
        deck_id: deckId,
        source_branch: input.source_branch,
        target_branch: input.target_branch,
        title: input.title,
        author_id: actorId,
      },
    });

    return mr;
  }

  // -------------------------------------------------------------------------
  // getMergeRequest
  // -------------------------------------------------------------------------

  async getMergeRequest(id: string): Promise<MergeRequest> {
    checkFeature(FEATURE_FLAGS.mergeRequest);
    const mr = await this.store.getMergeRequest(id);
    if (!mr) throw new MergeRequestNotFoundError(id);
    return mr;
  }

  // -------------------------------------------------------------------------
  // listMergeRequests
  // -------------------------------------------------------------------------

  async listMergeRequests(
    deckId: string,
    opts?: { status?: MergeRequestStatus },
  ): Promise<MergeRequest[]> {
    checkFeature(FEATURE_FLAGS.mergeRequest);
    return this.store.listMergeRequestsByDeck(deckId, opts);
  }

  // -------------------------------------------------------------------------
  // getMergeRequestDiffs
  // -------------------------------------------------------------------------

  async getMergeRequestDiffs(mrId: string, _level: SlideDiffLevel = 'slide'): Promise<SlideDiff> {
    checkFeature(FEATURE_FLAGS.mergeRequest);
    const diff = await this.store.getSlideDiffByMrId(mrId);
    if (!diff) throw new SlideDiffNotFoundError(mrId);
    return diff;
  }

  // -------------------------------------------------------------------------
  // resolveMergeRequestConflict
  // -------------------------------------------------------------------------

  async resolveMergeRequestConflict(
    mrId: string,
    resolutions: ConflictResolution[],
    actorId: string,
    _workspaceId: string,
  ): Promise<MergeRequest> {
    checkFeature(FEATURE_FLAGS.mergeRequest);

    const mr = await this.getMergeRequest(mrId);
    if (mr.status !== 'conflict' && mr.status !== 'open') {
      throw new MergeRequestValidationError(
        `Cannot resolve conflicts on MR with status '${mr.status}'`,
      );
    }

    if (!mr.diff_id) {
      throw new SlideDiffNotFoundError(mrId);
    }

    const diff = await this.store.getSlideDiff(mr.diff_id);
    if (!diff) throw new SlideDiffNotFoundError(mrId);

    // Apply resolutions to slide_diffs
    const updatedSlideDiffs = diff.slide_diffs.map((sd): SlideDiffEntry => {
      const resolution = resolutions.find((r) => r.slide_id === sd.slide_id);
      if (!resolution) return sd;

      // Apply resolution: 'theirs' keeps source (after), 'ours' keeps target (before)
      if (resolution.resolution === 'theirs') {
        return { ...sd, change_type: 'modified' as const };
      }
      if (resolution.resolution === 'ours') {
        return { ...sd, after: sd.before, change_type: 'modified' as const };
      }
      // manual
      if (resolution.manual_value) {
        return { ...sd, after: resolution.manual_value, change_type: 'modified' as const };
      }
      return sd;
    });

    // Update slide_diff
    await this.store.updateSlideDiff(diff.id, {
      slide_diffs: updatedSlideDiffs,
      binding_diffs: diff.binding_diffs,
    });

    // Check if all conflicts are now resolved
    const remainingConflicts = updatedSlideDiffs.filter((sd) =>
      sd.element_diffs.some((ed) => ed.is_conflict),
    );

    const newStatus: MergeRequestStatus = remainingConflicts.length === 0 ? 'open' : 'conflict';

    const now = this.now();
    const updatedMr: MergeRequest = {
      ...mr,
      status: newStatus,
      updated_at: now,
      updated_by: actorId,
    };
    await this.store.updateMergeRequest(updatedMr);

    return updatedMr;
  }

  // -------------------------------------------------------------------------
  // mergeMergeRequest
  // -------------------------------------------------------------------------

  async mergeMergeRequest(
    mrId: string,
    actorId: string,
    workspaceId: string,
    deckSnapshot?: DeckSnapshot,
  ): Promise<MergeRequest> {
    checkFeature(FEATURE_FLAGS.mergeRequest);

    const mr = await this.getMergeRequest(mrId);
    if (mr.status !== 'open' && mr.status !== 'approved') {
      throw new MergeRequestValidationError(
        `Cannot merge MR with status '${mr.status}' — must be 'open' or 'approved'`,
      );
    }

    // Check for unresolved conflicts
    if (mr.diff_id) {
      const diff = await this.store.getSlideDiff(mr.diff_id);
      if (diff) {
        const hasConflicts = diff.slide_diffs.some((sd) =>
          sd.element_diffs.some((ed) => ed.is_conflict),
        );
        if (hasConflicts) {
          throw new ConflictsUnresolvedError(
            diff.slide_diffs.filter((sd) => sd.element_diffs.some((ed) => ed.is_conflict)).length,
          );
        }

        // Run validation hooks if deck snapshot provided
        if (deckSnapshot) {
          await validateMerge(this.validators, deckSnapshot, diff);
        }
      }
    }

    // Atomic merge: update MR status + set merge metadata
    const now = this.now();
    const mergeCommitId = this.idGen();

    const mergedMr: MergeRequest = {
      ...mr,
      status: 'merged' as const,
      merged_at: now,
      merged_by: actorId,
      merge_commit_id: mergeCommitId,
      updated_at: now,
      updated_by: actorId,
    };

    await this.store.updateMergeRequest(mergedMr);

    // Emit merge_request.merged event
    await this.emitter.publish('merge_request.merged', {
      event_id: this.idGen(),
      event_type: 'merge_request.merged',
      ts_ms: now.getTime(),
      workspace_id: workspaceId,
      deck_id: mr.deck_id,
      actor_id: actorId,
      actor_type: 'member',
      payload: {
        mr_id: mrId,
        deck_id: mr.deck_id,
        merged_by: actorId,
        merge_commit_id: mergeCommitId,
      },
    });

    return mergedMr;
  }

  // -------------------------------------------------------------------------
  // closeMergeRequest
  // -------------------------------------------------------------------------

  async closeMergeRequest(mrId: string, actorId: string): Promise<MergeRequest> {
    checkFeature(FEATURE_FLAGS.mergeRequest);

    const mr = await this.getMergeRequest(mrId);
    const now = this.now();
    const closedMr: MergeRequest = {
      ...mr,
      status: 'closed' as const,
      updated_at: now,
      updated_by: actorId,
    };
    await this.store.updateMergeRequest(closedMr);
    return closedMr;
  }
}
