/**
 * Branch lineage — Phase 05 B.1 lineage walk.
 *
 * For each branch we walk the `parentBranchId` chain until it reaches
 * `main` (the root branch).  The returned lineage is ordered
 * child-first; the *last* entry is always the root branch.
 *
 * Lineage is a small enough operation that we don't need caching in
 * the in-memory repo — the pgx implementation issues a single
 * recursive CTE per call.
 */

import type { ULID } from '@domio/schema';

import { type BranchRecord, type BranchRepository, MAIN_BRANCH } from './dal.js';

export interface BranchLineage {
  /** The branch the lineage was computed from. */
  readonly branchId: ULID;
  /** Child-first, root-last walk of the branch chain. */
  readonly ancestors: BranchRecord[];
}

export async function computeLineage(
  repository: BranchRepository,
  deckId: ULID,
  branchId: ULID,
): Promise<BranchLineage> {
  const out: BranchRecord[] = [];
  let cursor: string = branchId;
  // Hard cap on cycle length so a malformed `parent_branch_id` cycle
  // can't lock up the call; production graphs are depth < 8.
  for (let i = 0; i < 64; i++) {
    const rec = await repository.findById(deckId, cursor as ULID);
    if (!rec) break;
    out.push(rec);
    if (rec.parentBranchId === MAIN_BRANCH) break;
    cursor = rec.parentBranchId;
  }
  return { branchId, ancestors: out };
}
