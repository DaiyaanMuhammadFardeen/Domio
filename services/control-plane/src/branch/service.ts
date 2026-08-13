/**
 * Branch service — Phase 05 B.1 logic.
 *
 * The service is the only entry point that knows about both the
 * branch repository and the revision / lineage modules.  REST
 * handlers wrap this service; gRPC adapters wrap it; the editor's
 * branch panel calls it through the typescript client.
 *
 * Validation policy is intentionally strict:
 *
 *   - Names are required, 1–256 chars, no leading or trailing
 *     whitespace; the regex `^[A-Za-z0-9._\-/ ]+$` covers the
 *     `experiment/header-v2`-style names the demo uses.
 *   - The "main" branch cannot be archived.
 *   - A duplicate name on the same deck returns
 *     {@link BranchAlreadyExistsError}.
 *
 * The service is intentionally side-effect free apart from the
 * repository calls so it can be reused from the merge module and
 * from the auto-checkpoint scheduler.
 */

import { asULID, type ULID } from '@domio/schema';

import {
  type BranchRecord,
  type BranchRepository,
  type BranchStatus,
  InMemoryBranchRepository,
  BranchAlreadyExistsError,
  BranchNotFoundError,
  MAIN_BRANCH,
} from './dal.js';

const BRANCH_NAME_PATTERN = /^[A-Za-z0-9._\-/ ]{1,256}$/;

export interface CreateBranchArgs {
  deckId: ULID;
  name: string;
  baseCheckpointId?: string | null;
  /** When omitted the new branch forks from `main` at the current head. */
  parentBranchId?: string;
  /** Actor creating the branch. */
  createdBy: string;
}

export interface BranchCheckout {
  branch: BranchRecord;
  resumeHlc: ResumeHLC;
}

export interface ResumeHLC {
  physical: number;
  logical: number;
}

export class InvalidBranchNameError extends Error {
  constructor(public readonly value: string) {
    super(`Branch name "${value}" is invalid.`);
    this.name = 'InvalidBranchNameError';
  }
}

export class CannotArchiveMainError extends Error {
  constructor() {
    super('The main branch cannot be archived.');
    this.name = 'CannotArchiveMainError';
  }
}

export class InvalidRevisionError extends Error {
  constructor(public readonly value: number) {
    super(`Revision ${value} must be a non-negative integer.`);
    this.name = 'InvalidRevisionError';
  }
}

/** Build a fresh ULID. Tests inject deterministic generators. */
export type IdGenerator = () => ULID;

/** Inject a clock for deterministic `createdAt`. */
export type Clock = () => Date;

const defaultId: IdGenerator = () =>
  asULID('01H00000000000000000000000').slice(0, 26).padEnd(26, '0') as ULID;

const defaultClock: Clock = () => new Date();

export class BranchService {
  constructor(
    private readonly repository: BranchRepository = new InMemoryBranchRepository(),
    private readonly id: IdGenerator = defaultId,
    private readonly clock: Clock = defaultClock,
  ) {}

  async create(args: CreateBranchArgs): Promise<BranchRecord> {
    const name = args.name.trim();
    if (!BRANCH_NAME_PATTERN.test(name)) {
      throw new InvalidBranchNameError(args.name);
    }
    const existing = await this.repository.findByName(args.deckId, name);
    if (existing) throw new BranchAlreadyExistsError(args.deckId, name);
    const now = this.clock();
    const parent = args.parentBranchId ?? MAIN_BRANCH;
    const parentRecord =
      parent === MAIN_BRANCH ? null : await this.repository.findById(args.deckId, parent as ULID);
    if (parent !== MAIN_BRANCH && !parentRecord) {
      throw new BranchNotFoundError(args.deckId, parent as ULID);
    }
    const record: BranchRecord = {
      id: this.id() as ULID,
      deckId: args.deckId,
      name,
      parentBranchId: parent,
      status: 'active',
      headRevision: parentRecord?.headRevision ?? 0,
      baseCheckpointId: args.baseCheckpointId ?? null,
      createdBy: args.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    await this.repository.insert(record);
    return record;
  }

  async get(deckId: ULID, branchId: ULID): Promise<BranchRecord> {
    const found = await this.repository.findById(deckId, branchId);
    if (!found) throw new BranchNotFoundError(deckId, branchId);
    return found;
  }

  async list(deckId: ULID, status?: BranchStatus): Promise<BranchRecord[]> {
    return this.repository.listByDeck(deckId, status ? { status } : {});
  }

  async archive(deckId: ULID, branchId: ULID): Promise<BranchRecord> {
    if ((branchId as string) === MAIN_BRANCH) {
      throw new CannotArchiveMainError();
    }
    const found = await this.get(deckId, branchId);
    if (found.status === 'archived') return found;
    return this.repository.updateStatus(deckId, branchId, 'archived');
  }

  async restore(deckId: ULID, branchId: ULID): Promise<BranchRecord> {
    return this.repository.updateStatus(deckId, branchId, 'active');
  }

  async checkout(deckId: ULID, branchId: ULID): Promise<BranchCheckout> {
    const branch = await this.get(deckId, branchId);
    // The HLC vector handed back here is per `(deck, branch)`.  In the
    // real deployment this is read from `branch_heads.hlc_*` via the
    // revisions module; the in-memory repository doesn't track HLCs,
    // so we emit (0, 0) which the editor treats as "no resume needed".
    return { branch, resumeHlc: { physical: 0, logical: 0 } };
  }

  async advanceHead(
    deckId: ULID,
    branchId: ULID,
    expectedRevision: number,
    nextRevision: number,
  ): Promise<BranchRecord> {
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
      throw new InvalidRevisionError(expectedRevision);
    }
    if (!Number.isInteger(nextRevision) || nextRevision <= expectedRevision) {
      throw new InvalidRevisionError(nextRevision);
    }
    return this.repository.advanceHead(deckId, branchId, expectedRevision, nextRevision);
  }

  /** Expose the underlying repository for read-only lineage walks. */
  getRepository(): BranchRepository {
    return this.repository;
  }
}

export type { BranchRecord, BranchRepository } from './dal.js';
export { BranchAlreadyExistsError, BranchNotFoundError, MAIN_BRANCH } from './dal.js';
