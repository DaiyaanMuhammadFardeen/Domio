import { describe, it, expect, vi } from 'vitest';
import { asULID, type DeckDocument, type ULID } from '@domio/schema';
import {
  BranchService,
  MergeService,
  InMemoryBranchRepository,
  InMemoryMergeRequestRepository,
  HttpError,
  asHttpError,
  createBranch,
  listBranches,
  archiveBranch,
  createMergeRequest,
  resolveMergeRequest,
  commitMergeRequest,
  computeDiffHandler,
} from './index.js';
import type { BranchHandlerContext } from './handlers.js';
import { BranchAlreadyExistsError } from './dal.js';

function makeDeck(x: number): DeckDocument {
  return {
    schemaVersion: '1.0.0',
    id: asULID('01H00000000000000000000000'),
    tenantId: 't-1',
    workspaceId: asULID('01H00000000000000000000001'),
    title: 'd',
    revision: 0,
    settings: { defaultSlideRatio: { ratioW: 16, ratioH: 9 } },
    slides: [
      {
        id: asULID('01H0000000000000000000000A'),
        semanticId: 'intro',
        position: 0,
        aspect: { ratioW: 16, ratioH: 9 },
        elements: [
          {
            id: asULID('01H0000000000000000000000B'),
            semanticId: 'title',
            name: 'T',
            type: 'text',
            parentId: null,
            transform: { x, y: 0, w: 100, h: 50 },
            text: { content: 'hi' },
          },
        ],
      },
    ],
  };
}

function ids(): () => ULID {
  let n = 1;
  return () => asULID(`01H0000000000000000000000${n++}`);
}

function makeCtx(): BranchHandlerContext & { fetch: ReturnType<typeof vi.fn> } {
  const repo = new InMemoryBranchRepository();
  const branchSvc = new BranchService(repo, ids());
  const mrSvc = new MergeService(
    branchSvc,
    new InMemoryMergeRequestRepository(),
    null,
    ids(),
    () => new Date('2026-04-01T00:00:00Z'),
  );
  // Allow tests to seed per-branch deck content so source/target can
  // diverge for diff tests. Callers update `decks` *before* invoking
  // a handler that reads from `fetchDeck`.
  const decks = new Map<string, DeckDocument>();
  const fetch = vi.fn(async (args: { deckId: ULID; branchId: string; revision: number }) => {
    const key = `${args.deckId}|${args.branchId}`;
    return decks.get(key) ?? makeDeck(0);
  });
  const fetchDeck = fetch as unknown as BranchHandlerContext['fetchDeck'];
  return {
    branches: branchSvc,
    merges: mrSvc,
    fetchDeck,
    fetch,
    decks,
  } as BranchHandlerContext & { fetch: ReturnType<typeof vi.fn>; decks: Map<string, DeckDocument> };
}

describe('Branch handlers', () => {
  it('createBranch returns the new branch', async () => {
    const ctx = makeCtx();
    const DECK_ID = asULID('01H00000000000000000000000');
    const out = await createBranch(
      ctx,
      DECK_ID,
      { name: 'feature/x', createdBy: 'user-1' },
      'trace-1',
    );
    expect(out.branch.name).toBe('feature/x');
    expect(out.traceId).toBe('trace-1');
  });

  it('createBranch maps duplicate names to HttpError 409', async () => {
    const ctx = makeCtx();
    const DECK_ID = asULID('01H00000000000000000000000');
    await createBranch(ctx, DECK_ID, { name: 'dup', createdBy: 'user-1' });
    await expect(
      createBranch(ctx, DECK_ID, { name: 'dup', createdBy: 'user-2' }),
    ).rejects.toBeInstanceOf(BranchAlreadyExistsError);
    try {
      await createBranch(ctx, DECK_ID, { name: 'dup', createdBy: 'user-3' });
    } catch (err) {
      const http = asHttpError(err);
      expect(http.status).toBe(409);
      expect(http.code).toBe('DUPLICATE_NAME');
    }
  });

  it('listBranches enumerates branches', async () => {
    const ctx = makeCtx();
    const DECK_ID = asULID('01H00000000000000000000000');
    await createBranch(ctx, DECK_ID, { name: 'a', createdBy: 'u' });
    await createBranch(ctx, DECK_ID, { name: 'b', createdBy: 'u' });
    const out = await listBranches(ctx, DECK_ID);
    expect(out.branches.length).toBe(2);
  });

  it('archiveBranch sets status archived', async () => {
    const ctx = makeCtx();
    const DECK_ID = asULID('01H00000000000000000000000');
    const created = await createBranch(ctx, DECK_ID, { name: 'arc', createdBy: 'u' });
    const out = await archiveBranch(ctx, DECK_ID, created.branch.id, { actorId: 'u' }, 'trace-2');
    expect(out.branch.status).toBe('archived');
  });
});

describe('Merge handlers', () => {
  it('createMergeRequest → resolve → commit flow', async () => {
    const ctx = makeCtx();
    const DECK_ID = asULID('01H00000000000000000000000');
    const a = await createBranch(ctx, DECK_ID, { name: 'a', createdBy: 'u' });
    const b = await createBranch(ctx, DECK_ID, {
      name: 'b',
      parentBranchId: a.branch.id,
      createdBy: 'u',
    });
    ctx.decks.set(`${DECK_ID}|${b.branch.id}`, makeDeck(10));
    ctx.decks.set(`${DECK_ID}|${a.branch.id}`, makeDeck(0));
    const mrResp = await createMergeRequest(
      ctx,
      DECK_ID,
      {
        sourceBranchId: b.branch.id,
        targetBranchId: a.branch.id,
        actorId: 'u',
      },
      'trace-mr',
    );
    const diff = mrResp.mergeRequest.diffSummary as {
      conflicts: Array<{ path: string }>;
      elements: Array<{ path: string }>;
    };
    // The diff may not contain a conflict if both sides changed the
    // same property to different values; pick the first element path.
    const path =
      diff.conflicts[0]?.path ??
      diff.elements[0]?.path ??
      `elements[01H0000000000000000000000B].transform.x`;
    const resolved = await resolveMergeRequest(
      ctx,
      DECK_ID,
      mrResp.mergeRequest.id,
      {
        strategy: 'manual',
        resolutions: { [path]: 200 },
      },
      'u',
      'trace-resolve',
    );
    expect(resolved.mergeRequest.status).toBe('resolved');
    const commit = await commitMergeRequest(
      ctx,
      DECK_ID,
      mrResp.mergeRequest.id,
      makeDeck(200),
      'u',
      'trace-commit',
    );
    expect(commit.newRevision).toBe(1);
    expect(commit.mergeRequest.status).toBe('merged');
  });
});

describe('Diff handler', () => {
  it('computeDiffHandler returns summary and fastForward flag', async () => {
    const ctx = makeCtx();
    const DECK_ID = asULID('01H00000000000000000000000');
    const a = await createBranch(ctx, DECK_ID, { name: 'main-x', createdBy: 'u' });
    const b = await createBranch(ctx, DECK_ID, {
      name: 'feat-x',
      parentBranchId: a.branch.id,
      createdBy: 'u',
    });
    ctx.decks.set(`${DECK_ID}|${b.branch.id}`, makeDeck(10));
    ctx.decks.set(`${DECK_ID}|${a.branch.id}`, makeDeck(0));
    const resp = await computeDiffHandler(
      ctx,
      DECK_ID,
      { sourceBranchId: b.branch.id, targetBranchId: a.branch.id },
      'trace-diff',
    );
    expect(resp.diffSummary.elements.length).toBeGreaterThan(0);
    expect(typeof resp.isFastForward).toBe('boolean');
  });
});

describe('asHttpError mapping', () => {
  it('returns an HttpError with appropriate status', () => {
    const err = asHttpError(new Error('boom'));
    expect(err).toBeInstanceOf(HttpError);
    expect(err.status).toBe(500);
  });
  it('passes through HttpError unchanged', () => {
    const orig = new HttpError(418, 'TEAPOT', 'tea');
    expect(asHttpError(orig)).toBe(orig);
  });
});
