/**
 * In-memory merge request store (Phase 18 W2).
 *
 * Backs every method of {@link MergeRequestStore} with Maps.
 * Used in unit tests and in dev when DATABASE_URL is unset.
 */

import type { MergeRequest, SlideDiff, MergeRequestStatus, SlideDiffEntry, BindingDiffEntry } from '../types.js';
import type { MergeRequestStore } from './store.js';

export class InMemoryMergeRequestStore implements MergeRequestStore {
  private readonly mergeRequests = new Map<string, MergeRequest>();
  private readonly slideDiffs = new Map<string, SlideDiff>();
  private readonly mrIdToDiffId = new Map<string, string>();

  // -------------------------------------------------------------------------
  // Merge requests
  // -------------------------------------------------------------------------

  async insertMergeRequest(mr: MergeRequest): Promise<void> {
    this.mergeRequests.set(mr.id, mr);
    if (mr.diff_id) {
      this.mrIdToDiffId.set(mr.id, mr.diff_id);
    }
  }

  async updateMergeRequest(mr: MergeRequest): Promise<void> {
    this.mergeRequests.set(mr.id, mr);
    if (mr.diff_id) {
      this.mrIdToDiffId.set(mr.id, mr.diff_id);
    }
  }

  async getMergeRequest(id: string): Promise<MergeRequest | null> {
    return this.mergeRequests.get(id) ?? null;
  }

  async listMergeRequestsByDeck(
    deckId: string,
    opts?: { status?: MergeRequestStatus },
  ): Promise<MergeRequest[]> {
    const results: MergeRequest[] = [];
    for (const mr of this.mergeRequests.values()) {
      if (mr.deck_id !== deckId) continue;
      if (opts?.status && mr.status !== opts.status) continue;
      results.push(mr);
    }
    return results.sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
  }

  // -------------------------------------------------------------------------
  // Slide diffs
  // -------------------------------------------------------------------------

  async insertSlideDiff(diff: SlideDiff): Promise<void> {
    this.slideDiffs.set(diff.id, diff);
    this.mrIdToDiffId.set(diff.mr_id, diff.id);
  }

  async getSlideDiff(id: string): Promise<SlideDiff | null> {
    return this.slideDiffs.get(id) ?? null;
  }

  async getSlideDiffByMrId(mrId: string): Promise<SlideDiff | null> {
    const diffId = this.mrIdToDiffId.get(mrId);
    if (!diffId) return null;
    return this.slideDiffs.get(diffId) ?? null;
  }

  async updateSlideDiff(
    id: string,
    patch: { slide_diffs: SlideDiffEntry[]; binding_diffs: BindingDiffEntry[] },
  ): Promise<void> {
    const existing = this.slideDiffs.get(id);
    if (!existing) return;
    const updated: SlideDiff = {
      ...existing,
      slide_diffs: patch.slide_diffs,
      binding_diffs: patch.binding_diffs,
    };
    this.slideDiffs.set(id, updated);
  }

  // -------------------------------------------------------------------------
  // Test helpers
  // -------------------------------------------------------------------------

  clear(): void {
    this.mergeRequests.clear();
    this.slideDiffs.clear();
    this.mrIdToDiffId.clear();
  }
}
