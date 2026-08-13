/**
 * Branch / MR / diff REST handlers — Phase 05 B.1 / B.2.
 *
 * The handlers accept a single {@link BranchHandlerContext} so they
 * can be mounted under any router that satisfies the
 * `HttpHandlerContext` shape (Express, Fastify, native `http`, the
 * editor's SSR bridge).  This keeps the package Web-framework-free.
 *
 * Every endpoint returns a {@link BranchResponse} / {@link MergeRequestResponse}
 * whose `traceId` is taken from the request id when present so the
 * observability layer can correlate.
 */

import type { ULID, DeckDocument } from '@domio/schema';
import { asULID } from '@domio/schema';

import {
  type BranchService,
  type BranchRecord,
  BranchAlreadyExistsError,
  BranchNotFoundError,
  CannotArchiveMainError,
  InvalidBranchNameError,
  MAIN_BRANCH,
} from './service.js';
import { computeLineage } from './lineage.js';
import { type MergeService } from './merge.js';
import { computeDiff, type DiffSummary } from './diff.js';
import type { ResolveRequest } from './resolver.js';
import { MissingManualResolutionsError } from './resolver.js';
import {
  ConflictsUnresolvedError,
  NoChangesToMergeError,
  TargetBranchArchivedError,
} from './merge.js';
import type { AuditRecorder } from './audit.js';
import type { MergeRequestRecord } from './merge_request_dal.js';

/** Server-side data sources the handlers need. */
export interface BranchHandlerContext {
  branches: BranchService;
  /** Optional audit sink for security/audit event emission. */
  audit?: AuditRecorder;
  /** Optional ACL guard; should reject viewers before data is read. */
  authorize?: (args: {
    actorId?: string;
    action: 'read-mr' | 'write-branch' | 'write-merge';
  }) => void;
  merges: MergeService;
  /**
   * Lookup function for retrieving a deck at a specific branch +
   * revision.  In production the control plane has direct DB access
   * via the {@link DocumentLoader}; for tests we hand the loader a
   * canned map keyed by `branchId`.
   */
  fetchDeck: (args: {
    deckId: ULID;
    branchId: string;
    revision: number;
  }) => Promise<DeckDocument | null>;
  /** Optional revision lookup.  Used by checkout. */
  headRevision?: (args: { deckId: ULID; branchId: string }) => Promise<number>;
}

export interface BranchResponse {
  branch: BranchRecord;
  traceId?: string;
}

export interface ListBranchesResponse {
  branches: BranchRecord[];
  traceId?: string;
}

export interface CheckoutResponse {
  branch: BranchRecord;
  resumeHlc: { physical: number; logical: number };
  traceId?: string;
}

export interface BranchLineageResponse {
  lineage: { branchId: ULID; ancestors: BranchRecord[] };
  traceId?: string;
}

export interface CreateBranchRequest {
  name: string;
  baseCheckpointId?: string;
  parentBranchId?: string;
  createdBy: string;
}

export interface ArchiveBranchRequest {
  actorId: string;
}

/** HTTP-style envelope; concrete routers map this to their request type. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export function asHttpError(err: unknown): HttpError {
  if (err instanceof HttpError) return err;
  if (err instanceof BranchNotFoundError) {
    return new HttpError(404, 'BRANCH_NOT_FOUND', err.message, {
      deckId: err.deckId,
      branchId: err.branchId,
    });
  }
  if (err instanceof BranchAlreadyExistsError) {
    return new HttpError(409, 'DUPLICATE_NAME', err.message, {
      deckId: err.deckId,
      name: err.name,
    });
  }
  if (err instanceof InvalidBranchNameError) {
    return new HttpError(400, 'INVALID_BRANCH_NAME', err.message, {
      value: err.value,
    });
  }
  if (err instanceof CannotArchiveMainError) {
    return new HttpError(400, 'CANNOT_ARCHIVE_MAIN', err.message);
  }
  if (err instanceof TargetBranchArchivedError) {
    return new HttpError(400, 'TARGET_BRANCH_ARCHIVED', err.message, {
      branchId: err.branchId,
    });
  }
  if (err instanceof NoChangesToMergeError) {
    return new HttpError(400, 'NO_CHANGES_TO_MERGE', err.message);
  }
  if (err instanceof ConflictsUnresolvedError) {
    return new HttpError(409, 'CONFLICTS_UNRESOLVED', err.message, {
      conflictCount: err.count,
    });
  }
  if (err instanceof MissingManualResolutionsError) {
    return new HttpError(400, 'MANUAL_RESOLUTIONS_MISSING', err.message, {
      missing: err.missing,
    });
  }
  return new HttpError(500, 'INTERNAL', (err as Error)?.message ?? 'unknown');
}

/* -------------------------------------------------------------------------- */
/* Branch endpoints                                                            */
/* -------------------------------------------------------------------------- */

export async function createBranch(
  ctx: BranchHandlerContext,
  deckId: ULID,
  body: CreateBranchRequest,
  traceId?: string,
): Promise<BranchResponse> {
  ctx.authorize?.({ actorId: body.createdBy, action: 'write-branch' });
  const branch = await ctx.branches.create({
    deckId,
    name: body.name,
    baseCheckpointId: body.baseCheckpointId ?? null,
    parentBranchId: body.parentBranchId ?? MAIN_BRANCH,
    createdBy: body.createdBy,
  });
  ctx.audit?.record({
    actorId: body.createdBy,
    action: 'branch.create',
    targetKind: 'branch',
    targetId: branch.id,
    metadata: { deckId, parentBranchId: branch.parentBranchId },
  });
  return { branch, ...(traceId ? { traceId } : {}) };
}

export async function listBranches(
  ctx: BranchHandlerContext,
  deckId: ULID,
  status?: 'active' | 'archived',
  traceId?: string,
): Promise<ListBranchesResponse> {
  const branches = await ctx.branches.list(deckId, status);
  return { branches, ...(traceId ? { traceId } : {}) };
}

export async function getBranch(
  ctx: BranchHandlerContext,
  deckId: ULID,
  branchId: ULID,
  traceId?: string,
): Promise<BranchResponse> {
  const branch = await ctx.branches.get(deckId, branchId);
  return { branch, ...(traceId ? { traceId } : {}) };
}

export async function checkoutBranch(
  ctx: BranchHandlerContext,
  deckId: ULID,
  branchId: ULID,
  traceId?: string,
): Promise<CheckoutResponse> {
  const { branch, resumeHlc } = await ctx.branches.checkout(deckId, branchId);
  return { branch, resumeHlc, ...(traceId ? { traceId } : {}) };
}

export async function archiveBranch(
  ctx: BranchHandlerContext,
  deckId: ULID,
  branchId: ULID,
  body: ArchiveBranchRequest,
  traceId?: string,
): Promise<BranchResponse> {
  ctx.authorize?.({ actorId: body.actorId, action: 'write-branch' });
  const branch = await ctx.branches.archive(deckId, branchId);
  ctx.audit?.record({
    actorId: body.actorId,
    action: 'branch.archive',
    targetKind: 'branch',
    targetId: branch.id,
    metadata: { deckId },
  });
  return { branch, ...(traceId ? { traceId } : {}) };
}

export async function getBranchLineage(
  ctx: BranchHandlerContext,
  deckId: ULID,
  branchId: ULID,
  traceId?: string,
): Promise<BranchLineageResponse> {
  const lineage = await computeLineage(ctx.branches.getRepository(), deckId, branchId);
  return { lineage, ...(traceId ? { traceId } : {}) };
}

/* -------------------------------------------------------------------------- */
/* Merge-request endpoints                                                     */
/* -------------------------------------------------------------------------- */

export interface CreateMergeRequestRequest {
  sourceBranchId: ULID;
  targetBranchId: ULID;
  baseRevision?: number;
  actorId: string;
}

export interface ResolveMergeRequestRequest {
  strategy: ResolveRequest['strategy'];
  resolutions?: ResolveRequest['resolutions'];
}

export interface MergeRequestResponse {
  mergeRequest: MergeRequestRecord;
  traceId?: string;
}

export interface CommitMergeResponse {
  mergeRequest: MergeRequestRecord;
  newRevision: number;
  traceId?: string;
}

export async function createMergeRequest(
  ctx: BranchHandlerContext,
  deckId: ULID,
  body: CreateMergeRequestRequest,
  traceId?: string,
): Promise<MergeRequestResponse> {
  const source = await ctx.branches.get(deckId, body.sourceBranchId);
  const target = await ctx.branches.get(deckId, body.targetBranchId);
  const sourceDeck = await ctx.fetchDeck({
    deckId,
    branchId: source.id,
    revision: source.headRevision,
  });
  const targetDeck = await ctx.fetchDeck({
    deckId,
    branchId: target.id,
    revision: target.headRevision,
  });
  if (!sourceDeck || !targetDeck) {
    throw new HttpError(404, 'DECK_OR_BRANCH_NOT_FOUND', 'Deck data missing.');
  }
  const baseDeck =
    body.baseRevision === undefined
      ? targetDeck
      : await ctx.fetchDeck({
          deckId,
          branchId: MAIN_BRANCH,
          revision: body.baseRevision,
        });
  const mr = await ctx.merges.createMergeRequest({
    deckId,
    sourceBranchId: source.id,
    targetBranchId: target.id,
    ...(body.baseRevision !== undefined ? { baseRevision: body.baseRevision } : {}),
    actorId: body.actorId,
    sourceRevision: source.headRevision,
    targetRevision: target.headRevision,
    sourceDeck,
    targetDeck,
    baseDeck: baseDeck ?? targetDeck,
  });
  return { mergeRequest: mr, ...(traceId ? { traceId } : {}) };
}

export async function getMergeRequest(
  ctx: BranchHandlerContext,
  deckId: ULID,
  mrId: ULID,
  actorIdOrTraceId?: string,
  traceId?: string,
): Promise<MergeRequestResponse> {
  // Callers that provide an ACL guard use the fourth argument as actorId;
  // legacy adapters may pass only traceId, so authorization remains opt-in.
  const actorId = ctx.authorize ? actorIdOrTraceId : undefined;
  if (actorId !== undefined) {
    ctx.authorize?.({ actorId, action: 'read-mr' });
  } else {
    ctx.authorize?.({ action: 'read-mr' });
  }
  const mr = await ctx.merges.getMergeRequest(deckId, mrId);
  const t = ctx.authorize ? traceId : actorIdOrTraceId;
  return { mergeRequest: mr, ...(t ? { traceId: t } : {}) };
}

export async function resolveMergeRequest(
  ctx: BranchHandlerContext,
  deckId: ULID,
  mrId: ULID,
  body: ResolveMergeRequestRequest,
  actorId: string,
  traceId?: string,
): Promise<MergeRequestResponse> {
  const mr = await ctx.merges.getMergeRequest(deckId, mrId);
  const diff = (mr.diffSummary as DiffSummary) ?? {
    slides: { added: [], removed: [], modified: [] },
    elements: [],
    conflicts: [],
  };
  // Pull the source/target decks for the resolver; for tests these
  // come from the in-memory repo.
  const source = await ctx.branches.get(deckId, mr.sourceBranchId);
  const target = await ctx.branches.get(deckId, mr.targetBranchId);
  const sourceDeck = await ctx.fetchDeck({
    deckId,
    branchId: source.id,
    revision: source.headRevision,
  });
  const targetDeck = await ctx.fetchDeck({
    deckId,
    branchId: target.id,
    revision: target.headRevision,
  });
  if (!sourceDeck || !targetDeck) {
    throw new HttpError(404, 'DECK_OR_BRANCH_NOT_FOUND', 'Deck data missing.');
  }
  const { record } = await ctx.merges.resolveMergeRequest(
    {
      deckId,
      mrId,
      request: {
        strategy: body.strategy,
        ...(body.resolutions !== undefined ? { resolutions: body.resolutions } : {}),
        resolvedAtRevision: mr.targetRevision,
      },
      actorId,
    },
    { sourceDeck, targetDeck, diff },
  );
  return { mergeRequest: record, ...(traceId ? { traceId } : {}) };
}

export async function commitMergeRequest(
  ctx: BranchHandlerContext,
  deckId: ULID,
  mrId: ULID,
  resolvedDeck: DeckDocument,
  actorId: string,
  traceId?: string,
): Promise<CommitMergeResponse> {
  ctx.authorize?.({ actorId, action: 'write-merge' });
  const { record, newRevision } = await ctx.merges.commitMergeRequest({
    deckId,
    mrId,
    actorId,
    resolvedDeck,
  });
  ctx.audit?.record({
    actorId,
    action: 'merge.commit',
    targetKind: 'merge_request',
    targetId: record.id,
    metadata: {
      deckId,
      sourceBranchId: record.sourceBranchId,
      targetBranchId: record.targetBranchId,
      revision: newRevision,
    },
  });
  return { mergeRequest: record, newRevision, ...(traceId ? { traceId } : {}) };
}

/* -------------------------------------------------------------------------- */
/* Diff endpoint                                                               */
/* -------------------------------------------------------------------------- */

export interface ComputeDiffRequest {
  sourceBranchId: ULID;
  targetBranchId: ULID;
  baseRevision?: number;
}

export interface ComputeDiffResponse {
  diffSummary: DiffSummary;
  isFastForward: boolean;
  traceId?: string;
}

export interface GetDiffResponse {
  diffSummary: DiffSummary;
  traceId?: string;
}

export async function computeDiffHandler(
  ctx: BranchHandlerContext,
  deckId: ULID,
  body: ComputeDiffRequest,
  traceId?: string,
): Promise<ComputeDiffResponse> {
  const source = await ctx.branches.get(deckId, body.sourceBranchId);
  const target = await ctx.branches.get(deckId, body.targetBranchId);
  const sourceDeck = await ctx.fetchDeck({
    deckId,
    branchId: source.id,
    revision: source.headRevision,
  });
  const targetDeck = await ctx.fetchDeck({
    deckId,
    branchId: target.id,
    revision: target.headRevision,
  });
  const baseDeck =
    body.baseRevision === undefined
      ? targetDeck
      : await ctx.fetchDeck({
          deckId,
          branchId: MAIN_BRANCH,
          revision: body.baseRevision,
        });
  if (!sourceDeck || !targetDeck || !baseDeck) {
    throw new HttpError(404, 'DECK_OR_BRANCH_NOT_FOUND', 'Deck data missing.');
  }
  const diffSummary = computeDiff({
    base: { branchId: MAIN_BRANCH, revision: body.baseRevision ?? 0, deck: baseDeck },
    source: { branchId: source.id, revision: source.headRevision, deck: sourceDeck },
    target: { branchId: target.id, revision: target.headRevision, deck: targetDeck },
  });
  const isFastForward =
    diffSummary.slides.added.length === 0 &&
    diffSummary.slides.removed.length === 0 &&
    diffSummary.slides.modified.length === 0 &&
    diffSummary.elements.length === 0;
  return { diffSummary, isFastForward, ...(traceId ? { traceId } : {}) };
}

export async function getDiff(
  ctx: BranchHandlerContext,
  deckId: ULID,
  mrId: ULID,
  traceId?: string,
): Promise<GetDiffResponse> {
  const mr = await ctx.merges.getMergeRequest(deckId, mrId);
  return {
    diffSummary: (mr.diffSummary ?? {
      slides: { added: [], removed: [], modified: [] },
      elements: [],
      conflicts: [],
    }) as DiffSummary,
    ...(traceId ? { traceId } : {}),
  };
}

export { asULID };
