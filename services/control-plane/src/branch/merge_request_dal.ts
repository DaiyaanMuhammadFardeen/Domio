/**
 * Merge-request DAL — Phase 05 B.2 persistence layer for
 * `merge_requests`.
 *
 * The schema lives in migration 0009; this DAL mirrors its columns.
 * Like {@link BranchRepository} it uses an in-memory implementation
 * keyed by `(deckId, mrId)` so the editor preview and the unit tests
 * run without Postgres.
 */

import type { ULID } from '@domio/schema';

export type MergeRequestStatus =
  | 'open'
  | 'resolved'
  | 'merged'
  | 'closed';

export type ResolutionStrategy = 'theirs' | 'ours' | 'manual';

export interface MergeRequestRecord {
  id: ULID;
  deckId: ULID;
  sourceBranchId: ULID;
  targetBranchId: ULID;
  status: MergeRequestStatus;
  sourceRevision: number;
  targetRevision: number;
  baseRevision: number;
  diffSummary: unknown;
  resolutionStrategy: ResolutionStrategy | null;
  resolvedBy: string | null;
  resolvedAt: Date | null;
  createdBy: string;
  createdAt: Date;
}

export interface MergeRequestRepository {
  insert(record: MergeRequestRecord): Promise<void>;
  update(record: MergeRequestRecord): Promise<void>;
  findById(deckId: ULID, mrId: ULID): Promise<MergeRequestRecord | null>;
  listByDeck(
    deckId: ULID,
    filter?: { status?: MergeRequestStatus },
  ): Promise<MergeRequestRecord[]>;
}

export class MergeRequestNotFoundError extends Error {
  constructor(public readonly deckId: ULID, public readonly mrId: ULID) {
    super(`Merge request ${mrId} not found on deck ${deckId}.`);
    this.name = 'MergeRequestNotFoundError';
  }
}

export class InMemoryMergeRequestRepository implements MergeRequestRepository {
  private readonly byDeck = new Map<ULID, Map<ULID, MergeRequestRecord>>();

  async insert(record: MergeRequestRecord): Promise<void> {
    this.bucket(record.deckId).set(record.id, record);
  }
  async update(record: MergeRequestRecord): Promise<void> {
    this.bucket(record.deckId).set(record.id, record);
  }
  async findById(deckId: ULID, mrId: ULID): Promise<MergeRequestRecord | null> {
    return this.bucket(deckId).get(mrId) ?? null;
  }
  async listByDeck(
    deckId: ULID,
    filter?: { status?: MergeRequestStatus },
  ): Promise<MergeRequestRecord[]> {
    const out: MergeRequestRecord[] = [];
    for (const rec of this.bucket(deckId).values()) {
      if (filter?.status && rec.status !== filter.status) continue;
      out.push(rec);
    }
    return out.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
  private bucket(deckId: ULID): Map<ULID, MergeRequestRecord> {
    let existing = this.byDeck.get(deckId);
    if (!existing) {
      existing = new Map();
      this.byDeck.set(deckId, existing);
    }
    return existing;
  }
}
