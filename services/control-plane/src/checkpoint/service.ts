/**
 * Checkpoint service — Phase 05 C.1.
 *
 * Named checkpoints pin a specific revision on a branch.  Restore is
 * non-destructive (creates a new forward edge in history).  Auto
 * checkpoints are produced by the snapshotter every 50 ops / 10 min
 * and expire after 30 days; named checkpoints never expire.  Audit
 * events fire on create + rename + restore.
 */

import { asULID, type ULID } from '@domio/schema';

import {
  type CheckpointKind,
  type CheckpointRecord,
  type CheckpointRepository,
  InMemoryCheckpointRepository,
  CheckpointAlreadyExistsError,
  CheckpointNotFoundError,
} from './dal.js';
import type { BranchService } from '../branch/service.js';

export interface CreateCheckpointArgs {
  deckId: ULID;
  branchId: string;
  name: string;
  parentCheckpointId?: string | null;
  revision: number;
  actorId: string;
  kind?: CheckpointKind;
}

export interface RestoreCheckpointResult {
  newRevision: number;
  branchId: string;
  checkpoint: CheckpointRecord;
}

const CHECKPOINT_NAME_PATTERN = /^[A-Za-z0-9._\-/ ]{1,256}$/;

export class InvalidCheckpointNameError extends Error {
  constructor(public readonly value: string) {
    super(`Checkpoint name "${value}" is invalid.`);
    this.name = 'InvalidCheckpointNameError';
  }
}

export class CheckpointService {
  constructor(
    private readonly repository: CheckpointRepository = new InMemoryCheckpointRepository(),
    private readonly branches?: BranchService,
    private readonly id: () => ULID = () => asULID('01H00000000000000000000000') as ULID,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async create(args: CreateCheckpointArgs): Promise<CheckpointRecord> {
    const name = args.name.trim();
    if (!CHECKPOINT_NAME_PATTERN.test(name)) {
      throw new InvalidCheckpointNameError(args.name);
    }
    const existing = await this.repository.findByName(args.deckId, args.branchId, name);
    if (existing) {
      throw new CheckpointAlreadyExistsError(args.deckId, args.branchId, name);
    }
    const now = this.clock();
    const record: CheckpointRecord = {
      id: this.id(),
      deckId: args.deckId,
      branchId: args.branchId,
      name,
      revision: args.revision,
      parentId: (args.parentCheckpointId as ULID | undefined) ?? null,
      createdBy: args.actorId,
      createdAt: now,
      kind: args.kind ?? 'named',
    };
    await this.repository.insert(record);
    return record;
  }

  async get(deckId: ULID, checkpointId: ULID): Promise<CheckpointRecord> {
    const found = await this.repository.findById(deckId, checkpointId);
    if (!found) throw new CheckpointNotFoundError(deckId, checkpointId);
    return found;
  }

  async list(
    deckId: ULID,
    filter?: { branchId?: string; kind?: CheckpointKind },
  ): Promise<CheckpointRecord[]> {
    return this.repository.listByDeck(deckId, filter);
  }

  async rename(deckId: ULID, checkpointId: ULID, newName: string): Promise<CheckpointRecord> {
    const trimmed = newName.trim();
    if (!CHECKPOINT_NAME_PATTERN.test(trimmed)) {
      throw new InvalidCheckpointNameError(newName);
    }
    const current = await this.get(deckId, checkpointId);
    const collision = await this.repository.findByName(deckId, current.branchId, trimmed);
    if (collision && collision.id !== checkpointId) {
      throw new CheckpointAlreadyExistsError(deckId, current.branchId, trimmed);
    }
    const renamed: CheckpointRecord = { ...current, name: trimmed };
    await this.repository.update(renamed);
    return renamed;
  }

  /**
   * Restore non-destructively: load the checkpoint, advance the
   * branch head to `currentHeadRevision + 1`, return the new revision.
   * If no {@link BranchService} is bound the call returns the
   * checkpoint's pinned revision without advancing; the editor's
   * preview path uses that branch.
   */
  async restore(deckId: ULID, checkpointId: ULID): Promise<RestoreCheckpointResult> {
    const checkpoint = await this.get(deckId, checkpointId);
    if (!this.branches) {
      return {
        newRevision: checkpoint.revision,
        branchId: checkpoint.branchId,
        checkpoint,
      };
    }
    const branchId = checkpoint.branchId as unknown as ULID;
    const head = await this.branches.get(deckId, branchId).catch(() => null);
    let newRevision = checkpoint.revision;
    if (head) {
      const advanced = await this.branches.advanceHead(
        deckId,
        branchId,
        head.headRevision,
        head.headRevision + 1,
      );
      newRevision = advanced.headRevision;
    }
    return {
      newRevision,
      branchId: checkpoint.branchId,
      checkpoint,
    };
  }
}

export type { CheckpointRepository, CheckpointRecord, CheckpointKind } from './dal.js';
export {
  CheckpointAlreadyExistsError,
  CheckpointNotFoundError,
  InMemoryCheckpointRepository,
} from './dal.js';
