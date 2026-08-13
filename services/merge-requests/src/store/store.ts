/**
 * Merge request store interface (Phase 18 W2).
 *
 * Transport-agnostic persistence layer for merge requests and slide diffs.
 * Two implementations:
 *  - {@link InMemoryMergeRequestStore} — used in tests and dev.
 *  - {@link PgMergeRequestStore}       — pg-pool-backed (full DML).
 */

import type {
  MergeRequest,
  SlideDiff,
  MergeRequestStatus,
  SlideDiffEntry,
  BindingDiffEntry,
} from '../types.js';

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

export interface MergeRequestStore {
  // -------------------------------------------------------------------------
  // Merge requests
  // -------------------------------------------------------------------------

  insertMergeRequest(mr: MergeRequest): Promise<void>;
  updateMergeRequest(mr: MergeRequest): Promise<void>;
  getMergeRequest(id: string): Promise<MergeRequest | null>;
  listMergeRequestsByDeck(
    deckId: string,
    opts?: { status?: MergeRequestStatus },
  ): Promise<MergeRequest[]>;

  // -------------------------------------------------------------------------
  // Slide diffs
  // -------------------------------------------------------------------------

  insertSlideDiff(diff: SlideDiff): Promise<void>;
  getSlideDiff(id: string): Promise<SlideDiff | null>;
  getSlideDiffByMrId(mrId: string): Promise<SlideDiff | null>;
  updateSlideDiff(
    id: string,
    patch: { slide_diffs: SlideDiffEntry[]; binding_diffs: BindingDiffEntry[] },
  ): Promise<void>;
}
