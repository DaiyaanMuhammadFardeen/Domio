/**
 * Branch DAL — Phase 05 persistence layer for `branches` and
 * `branch_heads`.
 *
 * The DAL is the only place that knows about Postgres in the branch
 * module; everything else speaks to the {@link BranchRepository}
 * interface.  This keeps unit tests hermetic (in-memory implementations
 * can substitute) and decouples Phase 05 logic from the eventual pgx
 * driver.
 *
 * The shape of {@link BranchRecord} mirrors the SQL columns added by
 * migration 0008 (`branches`) and migration 0007 (`branch_heads`).
 */

import type { ULID } from '@domio/schema';

export type BranchStatus = 'active' | 'archived';
export const MAIN_BRANCH = 'main';
export const DEFAULT_HEAD_REVISION = 0;

export interface BranchRecord {
  id: ULID;
  deckId: ULID;
  name: string;
  parentBranchId: string;
  status: BranchStatus;
  headRevision: number;
  baseCheckpointId: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface BranchRepository {
  /** Insert a brand-new branch row (idempotent on `id`). */
  insert(record: BranchRecord): Promise<void>;
  /** Return a branch by id, or null when not found. */
  findById(deckId: ULID, branchId: ULID): Promise<BranchRecord | null>;
  /** Return a branch by name (case-sensitive), or null when not found. */
  findByName(deckId: ULID, name: string): Promise<BranchRecord | null>;
  /** Enumerate branches for a deck, optionally filtered by status. */
  listByDeck(
    deckId: ULID,
    filter?: { status?: BranchStatus },
  ): Promise<BranchRecord[]>;
  /** Update the status field of an existing branch. */
  updateStatus(
    deckId: ULID,
    branchId: ULID,
    status: BranchStatus,
  ): Promise<BranchRecord>;
  /**
   * Advance the stored `head_revision` for a branch.  Throws
   * {@link BranchHeadConflictError} on optimistic-lock mismatch.
   */
  advanceHead(
    deckId: ULID,
    branchId: ULID,
    expectedRevision: number,
    nextRevision: number,
  ): Promise<BranchRecord>;
}

export class BranchNotFoundError extends Error {
  constructor(public readonly deckId: ULID, public readonly branchId: ULID) {
    super(`Branch ${branchId} not found on deck ${deckId}.`);
    this.name = 'BranchNotFoundError';
  }
}

export class BranchAlreadyExistsError extends Error {
  constructor(public readonly deckId: ULID, public readonly name: string) {
    super(`Branch "${name}" already exists on deck ${deckId}.`);
    this.name = 'BranchAlreadyExistsError';
  }
}

export class BranchHeadConflictError extends Error {
  constructor(
    public readonly deckId: ULID,
    public readonly branchId: ULID,
    public readonly expected: number,
    public readonly actual: number,
  ) {
    super(
      `Branch "${branchId}" head expected ${expected} but found ${actual}.`,
    );
    this.name = 'BranchHeadConflictError';
  }
}

/** Sentinel branch id used by {@link BranchRecord.parentBranchId} for root branches. */
export class InMemoryBranchRepository implements BranchRepository {
  private readonly byDeck = new Map<
    ULID,
    Map<ULID, BranchRecord> & { byName: Map<string, ULID> }
  >();

  async insert(record: BranchRecord): Promise<void> {
    this.bucket(record.deckId).set(record.id, record);
    this.bucket(record.deckId).byName.set(record.name, record.id);
  }

  async findById(deckId: ULID, branchId: ULID): Promise<BranchRecord | null> {
    return this.bucket(deckId).get(branchId) ?? null;
  }

  async findByName(deckId: ULID, name: string): Promise<BranchRecord | null> {
    const id = this.bucket(deckId).byName.get(name);
    return id ? (this.bucket(deckId).get(id) ?? null) : null;
  }

  async listByDeck(
    deckId: ULID,
    filter?: { status?: BranchStatus },
  ): Promise<BranchRecord[]> {
    const out: BranchRecord[] = [];
    for (const rec of this.bucket(deckId).values()) {
      if (filter?.status && rec.status !== filter.status) continue;
      out.push(rec);
    }
    return out.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async updateStatus(
    deckId: ULID,
    branchId: ULID,
    status: BranchStatus,
  ): Promise<BranchRecord> {
    const current = this.bucket(deckId).get(branchId);
    if (!current) throw new BranchNotFoundError(deckId, branchId);
    const next: BranchRecord = {
      ...current,
      status,
      updatedAt: new Date(),
    };
    this.bucket(deckId).set(branchId, next);
    return next;
  }

  async advanceHead(
    deckId: ULID,
    branchId: ULID,
    expectedRevision: number,
    nextRevision: number,
  ): Promise<BranchRecord> {
    const current = this.bucket(deckId).get(branchId);
    if (!current) throw new BranchNotFoundError(deckId, branchId);
    if (current.headRevision !== expectedRevision) {
      throw new BranchHeadConflictError(
        deckId,
        branchId,
        expectedRevision,
        current.headRevision,
      );
    }
    const advanced: BranchRecord = {
      ...current,
      headRevision: nextRevision,
      updatedAt: new Date(),
    };
    this.bucket(deckId).set(branchId, advanced);
    return advanced;
  }

  /**
   * The `byName` reverse-index is stored on the same Map prototype so
   * the implementation matches the real Postgres-backed driver
   * (`UNIQUE (deck_id, name)`).
   */
  private bucket(deckId: ULID): Map<ULID, BranchRecord> & { byName: Map<string, ULID> } {
    let existing = this.byDeck.get(deckId);
    if (!existing) {
      const created = new Map() as Map<ULID, BranchRecord> & { byName: Map<string, ULID> };
      created.byName = new Map();
      existing = created;
      this.byDeck.set(deckId, existing);
    }
    return existing;
  }
}
