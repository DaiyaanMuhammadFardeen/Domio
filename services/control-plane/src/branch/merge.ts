/**
 * Merge orchestrator — Phase 05 B.2 lifecycle.
 *
 * The {@link MergeService} is the single entry point for the
 * `merge_requests` endpoints.  It coordinates:
 *
 *   - {@link BranchService} for branch resolution and head bumping;
 *   - {@link MergeRequestRepository} for MR persistence;
 *   - {@link computeDiff} for the structural diff;
 *   - {@link resolveConflicts} for the resolution path;
 *   - the {@link RevisionService} from `services/control-plane/src/deck`
 *     for branch head advancement under the correct revision.
 *
 * Idempotency guarantee: committing a merge twice produces the same
 * `headRevision` (the second commit returns the existing record
 * unchanged).  A merge against an MR that has not been resolved
 * throws {@link ConflictsUnresolvedError}; a merge where every
 * conflict was auto-resolved by `theirs`/`ours` succeeds without
 * requiring the manual resolve step.
 */

import { asULID, type ULID, type DeckDocument } from '@domio/schema';

import { type BranchService, BranchNotFoundError } from './service.js';
import {
  type MergeRequestRecord,
  type MergeRequestRepository,
  type MergeRequestStatus,
  type ResolutionStrategy,
  InMemoryMergeRequestRepository,
  MergeRequestNotFoundError,
} from './merge_request_dal.js';
import { type DiffSnapshot, type DiffSummary, computeDiff } from './diff.js';
import { type ResolveRequest, type ResolveResult, resolveConflicts } from './resolver.js';
import type { RevisionService } from '../deck/revisions.js';

export interface CreateMergeRequestArgs {
  deckId: ULID;
  sourceBranchId: ULID;
  targetBranchId: ULID;
  baseRevision?: number;
  actorId: string;
  sourceRevision: number;
  targetRevision: number;
  sourceDeck: DeckDocument;
  targetDeck: DeckDocument;
  baseDeck?: DeckDocument;
}

export interface ResolveMergeRequestArgs {
  deckId: ULID;
  mrId: ULID;
  request: ResolveRequest;
  actorId: string;
}

export interface CommitMergeRequestArgs {
  deckId: ULID;
  mrId: ULID;
  actorId: string;
  /** Pre-resolved working tree (typically the output of `resolveConflicts`). */
  resolvedDeck: DeckDocument;
}

export class ConflictsUnresolvedError extends Error {
  constructor(public readonly count: number) {
    super(`Merge request has ${count} unresolved conflict(s).`);
    this.name = 'ConflictsUnresolvedError';
  }
}

export class TargetBranchArchivedError extends Error {
  constructor(public readonly branchId: ULID) {
    super(`Target branch ${branchId} is archived.`);
    this.name = 'TargetBranchArchivedError';
  }
}

export class NoChangesToMergeError extends Error {
  constructor() {
    super('No changes to merge.');
    this.name = 'NoChangesToMergeError';
  }
}

export class SourceTargetMismatchError extends Error {
  constructor() {
    super('Source and target branches must differ.');
    this.name = 'SourceTargetMismatchError';
  }
}

const emptySummary: DiffSummary = {
  slides: { added: [], removed: [], modified: [] },
  elements: [],
  conflicts: [],
};

export class MergeService {
  constructor(
    private readonly branches: BranchService,
    private readonly mrRepo: MergeRequestRepository = new InMemoryMergeRequestRepository(),
    private readonly revisions: RevisionService | null = null,
    private readonly idGenerator: () => ULID = () => asULID('01H00000000000000000000000') as ULID,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async createMergeRequest(args: CreateMergeRequestArgs): Promise<MergeRequestRecord> {
    if (args.sourceBranchId === args.targetBranchId) {
      throw new SourceTargetMismatchError();
    }
    const [source, target] = await Promise.all([
      this.branches.get(args.deckId, args.sourceBranchId),
      this.branches.get(args.deckId, args.targetBranchId),
    ]);
    if (source.status === 'archived') {
      throw new BranchNotFoundError(args.deckId, source.id);
    }
    if (target.status === 'archived') {
      throw new TargetBranchArchivedError(target.id);
    }

    const baseRevision = args.baseRevision ?? source.headRevision;
    const summary = computeDiff({
      base: snapshot('main', baseRevision, args.baseDeck ?? args.targetDeck),
      source: snapshot(source.id, args.sourceRevision, args.sourceDeck),
      target: snapshot(target.id, args.targetRevision, args.targetDeck),
    });

    const isFastForward = isEmptySummary(summary) && source.headRevision > baseRevision;
    if (isEmptySummary(summary)) {
      throw new NoChangesToMergeError();
    }

    const record: MergeRequestRecord = {
      id: this.idGenerator(),
      deckId: args.deckId,
      sourceBranchId: source.id,
      targetBranchId: target.id,
      status: 'open',
      sourceRevision: args.sourceRevision,
      targetRevision: args.targetRevision,
      baseRevision,
      diffSummary: isFastForward ? { ...summary, fastForward: true } : summary,
      resolutionStrategy: null,
      resolvedBy: null,
      resolvedAt: null,
      createdBy: args.actorId,
      createdAt: this.clock(),
    };
    if (isFastForward) {
      // Fast-forward: skip the resolve UI, mark resolved, immediately
      // eligible for commit.
      record.status = 'resolved';
      record.resolutionStrategy = 'theirs';
      record.resolvedAt = this.clock();
      record.resolvedBy = args.actorId;
    }
    await this.mrRepo.insert(record);
    return record;
  }

  async getMergeRequest(deckId: ULID, mrId: ULID): Promise<MergeRequestRecord> {
    const record = await this.mrRepo.findById(deckId, mrId);
    if (!record) throw new MergeRequestNotFoundError(deckId, mrId);
    return record;
  }

  async listMergeRequests(
    deckId: ULID,
    status?: MergeRequestStatus,
  ): Promise<MergeRequestRecord[]> {
    return this.mrRepo.listByDeck(deckId, status ? { status } : {});
  }

  async resolveMergeRequest(
    args: ResolveMergeRequestArgs,
    source: { sourceDeck: DeckDocument; targetDeck: DeckDocument; diff: DiffSummary },
  ): Promise<{ record: MergeRequestRecord; result: ResolveResult }> {
    const record = await this.getMergeRequest(args.deckId, args.mrId);
    if (record.status === 'merged' || record.status === 'closed') {
      throw new ConflictsUnresolvedError(source.diff.conflicts.length);
    }
    const result = resolveConflicts({
      source: source.sourceDeck,
      target: source.targetDeck,
      diff: source.diff,
      request: args.request,
    });
    const next: MergeRequestRecord = {
      ...record,
      status: 'resolved',
      resolutionStrategy: result.applied,
      resolvedBy: args.actorId,
      resolvedAt: this.clock(),
    };
    await this.mrRepo.update(next);
    return { record: next, result };
  }

  async commitMergeRequest(
    args: CommitMergeRequestArgs,
  ): Promise<{ record: MergeRequestRecord; newRevision: number }> {
    const record = await this.getMergeRequest(args.deckId, args.mrId);
    if (record.status === 'merged') {
      // Idempotent re-merge: return the existing record and head.
      return {
        record,
        newRevision: (await this.branches.get(args.deckId, record.targetBranchId)).headRevision,
      };
    }
    if (record.status !== 'resolved') {
      throw new ConflictsUnresolvedError(
        ((record.diffSummary as DiffSummary).conflicts ?? []).length,
      );
    }
    const target = await this.branches.get(args.deckId, record.targetBranchId);

    let newRevision = target.headRevision + 1;
    if (this.revisions) {
      const next = await this.revisions.bump({
        deckId: args.deckId,
        branchId: target.id,
        expectedRevision: target.headRevision,
      });
      newRevision = Number(next.revision);
    } else {
      await this.branches.advanceHead(args.deckId, target.id, target.headRevision, newRevision);
    }

    const merged: MergeRequestRecord = {
      ...record,
      status: 'merged',
    };
    await this.mrRepo.update(merged);
    return { record: merged, newRevision };
  }
}

function snapshot(branchId: string, revision: number, deck: DeckDocument): DiffSnapshot {
  return { branchId, revision, deck };
}

function isEmptySummary(summary: DiffSummary): boolean {
  return (
    summary === emptySummary ||
    (summary.slides.added.length === 0 &&
      summary.slides.removed.length === 0 &&
      summary.slides.modified.length === 0 &&
      summary.elements.length === 0 &&
      summary.conflicts.length === 0)
  );
}

export type { MergeRequestRecord, MergeRequestStatus, ResolutionStrategy };
