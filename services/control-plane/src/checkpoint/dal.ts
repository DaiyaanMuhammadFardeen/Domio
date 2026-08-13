/**
 * Checkpoint DAL — Phase 05 C.1.
 *
 * A checkpoint pins a specific revision on a branch so users can
 * restore to that state non-destructively.  Named checkpoints never
 * expire; auto checkpoints expire after 30 days (enforced by the
 * background pruner in `workers/sync/cmd/sync-worker`).
 *
 * The schema mirrors the SQL columns added in migration 0009
 * (`checkpoints`).
 */

import type { ULID } from '@domio/schema';

export type CheckpointKind = 'named' | 'auto';

export interface CheckpointRecord {
  id: ULID;
  deckId: ULID;
  branchId: string;
  name: string;
  revision: number;
  parentId: ULID | null;
  createdBy: string;
  createdAt: Date;
  kind: CheckpointKind;
}

export interface CheckpointRepository {
  insert(record: CheckpointRecord): Promise<void>;
  update(record: CheckpointRecord): Promise<void>;
  findById(deckId: ULID, checkpointId: ULID): Promise<CheckpointRecord | null>;
  findByName(deckId: ULID, branchId: string, name: string): Promise<CheckpointRecord | null>;
  listByDeck(
    deckId: ULID,
    filter?: { branchId?: string; kind?: CheckpointKind },
  ): Promise<CheckpointRecord[]>;
}

export class CheckpointNotFoundError extends Error {
  constructor(
    public readonly deckId: ULID,
    public readonly checkpointId: ULID,
  ) {
    super(`Checkpoint ${checkpointId} not found on deck ${deckId}.`);
    this.name = 'CheckpointNotFoundError';
  }
}

export class CheckpointAlreadyExistsError extends Error {
  constructor(
    public readonly deckId: ULID,
    public readonly branchId: string,
    public readonly name: string,
  ) {
    super(`Checkpoint "${name}" already exists on ${deckId}/${branchId}.`);
    this.name = 'CheckpointAlreadyExistsError';
  }
}

export class InMemoryCheckpointRepository implements CheckpointRepository {
  private readonly byDeck = new Map<
    ULID,
    Map<ULID, CheckpointRecord> & { byName: Map<string, ULID> }
  >();

  async insert(record: CheckpointRecord): Promise<void> {
    const bucket = this.bucket(record.deckId);
    bucket.set(record.id, record);
    bucket.byName.set(`${record.branchId}|${record.name}`, record.id);
  }
  async update(record: CheckpointRecord): Promise<void> {
    await this.insert(record);
  }
  async findById(deckId: ULID, id: ULID): Promise<CheckpointRecord | null> {
    return this.bucket(deckId).get(id) ?? null;
  }
  async findByName(deckId: ULID, branchId: string, name: string): Promise<CheckpointRecord | null> {
    const bucket = this.bucket(deckId);
    const id = bucket.byName.get(`${branchId}|${name}`);
    return id ? (bucket.get(id) ?? null) : null;
  }
  async listByDeck(
    deckId: ULID,
    filter?: { branchId?: string; kind?: CheckpointKind },
  ): Promise<CheckpointRecord[]> {
    const out: CheckpointRecord[] = [];
    for (const rec of this.bucket(deckId).values()) {
      if (filter?.branchId && rec.branchId !== filter.branchId) continue;
      if (filter?.kind && rec.kind !== filter.kind) continue;
      out.push(rec);
    }
    return out.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  private bucket(deckId: ULID): Map<ULID, CheckpointRecord> & { byName: Map<string, ULID> } {
    let existing = this.byDeck.get(deckId);
    if (!existing) {
      const created = new Map() as Map<ULID, CheckpointRecord> & { byName: Map<string, ULID> };
      created.byName = new Map();
      existing = created;
      this.byDeck.set(deckId, existing);
    }
    return existing;
  }
}
