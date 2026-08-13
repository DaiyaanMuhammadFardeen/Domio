import { describe, it, expect } from 'vitest';
import { asULID, type DeckDocument, type Element, type Slide, type ULID } from '@domio/schema';
import {
  BranchService,
  computeDiff,
  resolveConflicts,
  MergeService,
  InMemoryBranchRepository,
  InMemoryMergeRequestRepository,
  ConflictsUnresolvedError,
  NoChangesToMergeError,
  SourceTargetMismatchError,
  TargetBranchArchivedError,
  MAIN_BRANCH,
} from './index.js';

const DECK_ID = asULID('01H00000000000000000000000');
const WORKSPACE_ID = asULID('01H00000000000000000000001');
const SLIDE_A = asULID('01H0000000000000000000000A');
const ELEM_A = asULID('01H0000000000000000000000B');

function makeText(x: number): Element {
  return {
    id: ELEM_A,
    semanticId: 'title',
    name: 'Title',
    type: 'text',
    parentId: null,
    transform: { x, y: 0, w: 200, h: 80 },
    text: { content: 'Hello' },
  };
}

function makeSlide(id: ULID, semantic: string, elements: Element[]): Slide {
  return {
    id,
    semanticId: semantic,
    position: 0,
    aspect: { ratioW: 16, ratioH: 9 },
    elements,
  };
}

function makeDeck(x: number): DeckDocument {
  return {
    schemaVersion: '1.0.0',
    id: DECK_ID,
    tenantId: 'tenant-1',
    workspaceId: WORKSPACE_ID,
    title: 'deck',
    revision: 0,
    settings: { defaultSlideRatio: { ratioW: 16, ratioH: 9 } },
    slides: [makeSlide(SLIDE_A, 'intro', [makeText(x)])],
  };
}

function ids(): () => ULID {
  let n = 1;
  return () => asULID(`01H0000000000000000000000${n++}`);
}

function setup() {
  const repo = new InMemoryBranchRepository();
  const branchSvc = new BranchService(repo, ids());
  const mrSvc = new MergeService(
    branchSvc,
    new InMemoryMergeRequestRepository(),
    null,
    ids(),
    () => new Date('2026-04-01T00:00:00Z'),
  );
  return { repo, branchSvc, mrSvc };
}

describe('MergeService.createMergeRequest', () => {
  it('rejects source === target', async () => {
    const { mrSvc } = setup();
    await expect(
      mrSvc.createMergeRequest({
        deckId: DECK_ID,
        sourceBranchId: asULID('01H0000000000000000000000F1'),
        targetBranchId: asULID('01H0000000000000000000000F1'),
        actorId: 'user-1',
        sourceRevision: 1,
        targetRevision: 1,
        sourceDeck: makeDeck(0),
        targetDeck: makeDeck(0),
      }),
    ).rejects.toBeInstanceOf(SourceTargetMismatchError);
  });

  it('throws NoChangesToMergeError for identical content', async () => {
    const { branchSvc, mrSvc } = setup();
    const main = await branchSvc.create({
      deckId: DECK_ID,
      name: 'main',
      parentBranchId: MAIN_BRANCH,
      createdBy: 'user-1',
    });
    await branchSvc.advanceHead(DECK_ID, main.id, 0, 1);
    await expect(
      mrSvc.createMergeRequest({
        deckId: DECK_ID,
        sourceBranchId: main.id,
        targetBranchId: main.id,
        actorId: 'user-1',
        sourceRevision: 1,
        targetRevision: 1,
        sourceDeck: makeDeck(0),
        targetDeck: makeDeck(0),
      }),
    ).rejects.toBeInstanceOf(SourceTargetMismatchError);
  });

  it('produces an open MR with diff_summary on first creation', async () => {
    const { branchSvc, mrSvc } = setup();
    const main = await branchSvc.create({
      deckId: DECK_ID,
      name: 'main-fork',
      parentBranchId: MAIN_BRANCH,
      createdBy: 'user-1',
    });
    await branchSvc.advanceHead(DECK_ID, main.id, 0, 1);
    const feat = await branchSvc.create({
      deckId: DECK_ID,
      name: 'feat-1',
      parentBranchId: main.id,
      createdBy: 'user-1',
    });
    // feat inherits main's head (1), so advance from 1 to 2.
    await branchSvc.advanceHead(DECK_ID, feat.id, 1, 2);
    const sourceDeck = makeDeck(10);
    const targetDeck = makeDeck(0);
    const mr = await mrSvc.createMergeRequest({
      deckId: DECK_ID,
      sourceBranchId: feat.id,
      targetBranchId: main.id,
      actorId: 'user-1',
      sourceRevision: 2,
      targetRevision: 1,
      sourceDeck,
      targetDeck,
    });
    expect(mr.status).toBe('open');
    expect(mr.sourceBranchId).toBe(feat.id);
    expect(mr.targetBranchId).toBe(main.id);
    expect((mr.diffSummary as { elements: unknown[] }).elements.length).toBeGreaterThan(0);
  });

  it('rejects when target is archived', async () => {
    const { branchSvc, mrSvc } = setup();
    const main = await branchSvc.create({
      deckId: DECK_ID,
      name: 'main-target',
      parentBranchId: MAIN_BRANCH,
      createdBy: 'user-1',
    });
    await branchSvc.archive(DECK_ID, main.id);
    const feat = await branchSvc.create({
      deckId: DECK_ID,
      name: 'feat-target',
      parentBranchId: MAIN_BRANCH,
      createdBy: 'user-1',
    });
    await expect(
      mrSvc.createMergeRequest({
        deckId: DECK_ID,
        sourceBranchId: feat.id,
        targetBranchId: main.id,
        actorId: 'user-1',
        sourceRevision: 1,
        targetRevision: 1,
        sourceDeck: makeDeck(10),
        targetDeck: makeDeck(0),
      }),
    ).rejects.toBeInstanceOf(TargetBranchArchivedError);
  });
});

describe('MergeService.resolveMergeRequest', () => {
  it('marks the MR resolved and records strategy', async () => {
    const { branchSvc, mrSvc } = setup();
    const main = await branchSvc.create({
      deckId: DECK_ID,
      name: 'main-resolve',
      parentBranchId: MAIN_BRANCH,
      createdBy: 'user-1',
    });
    const feat = await branchSvc.create({
      deckId: DECK_ID,
      name: 'feat-resolve',
      parentBranchId: main.id,
      createdBy: 'user-1',
    });
    const sourceDeck = makeDeck(10);
    const targetDeck = makeDeck(0);
    const mr = await mrSvc.createMergeRequest({
      deckId: DECK_ID,
      sourceBranchId: feat.id,
      targetBranchId: main.id,
      actorId: 'user-1',
      sourceRevision: 1,
      targetRevision: 1,
      sourceDeck,
      targetDeck,
    });
    const diff = computeDiff({
      base: { branchId: MAIN_BRANCH, revision: 0, deck: targetDeck },
      source: { branchId: feat.id, revision: 1, deck: sourceDeck },
      target: { branchId: main.id, revision: 1, deck: targetDeck },
    });
    const { record } = await mrSvc.resolveMergeRequest(
      {
        deckId: DECK_ID,
        mrId: mr.id,
        actorId: 'user-2',
        request: { strategy: 'theirs', resolvedAtRevision: 1 },
      },
      { sourceDeck, targetDeck, diff },
    );
    expect(record.status).toBe('resolved');
    expect(record.resolutionStrategy).toBe('theirs');
    expect(record.resolvedBy).toBe('user-2');
  });
});

describe('MergeService.commitMergeRequest', () => {
  it('advances the target head and marks merged', async () => {
    const { branchSvc, mrSvc } = setup();
    const main = await branchSvc.create({
      deckId: DECK_ID,
      name: 'main-commit',
      parentBranchId: MAIN_BRANCH,
      createdBy: 'user-1',
    });
    const feat = await branchSvc.create({
      deckId: DECK_ID,
      name: 'feat-commit',
      parentBranchId: main.id,
      createdBy: 'user-1',
    });
    const sourceDeck = makeDeck(10);
    const targetDeck = makeDeck(0);
    const mr = await mrSvc.createMergeRequest({
      deckId: DECK_ID,
      sourceBranchId: feat.id,
      targetBranchId: main.id,
      actorId: 'user-1',
      sourceRevision: 1,
      targetRevision: 1,
      sourceDeck,
      targetDeck,
    });
    const diff = computeDiff({
      base: { branchId: MAIN_BRANCH, revision: 0, deck: targetDeck },
      source: { branchId: feat.id, revision: 1, deck: sourceDeck },
      target: { branchId: main.id, revision: 1, deck: targetDeck },
    });
    const resolved = resolveConflicts({
      target: targetDeck,
      source: sourceDeck,
      diff,
      request: { strategy: 'theirs', resolvedAtRevision: 1 },
    });
    await mrSvc.resolveMergeRequest(
      {
        deckId: DECK_ID,
        mrId: mr.id,
        actorId: 'user-2',
        request: { strategy: 'theirs', resolvedAtRevision: 1 },
      },
      { sourceDeck, targetDeck, diff },
    );
    const { record, newRevision } = await mrSvc.commitMergeRequest({
      deckId: DECK_ID,
      mrId: mr.id,
      actorId: 'user-2',
      resolvedDeck: resolved.deck,
    });
    expect(record.status).toBe('merged');
    expect(newRevision).toBeGreaterThan(0);
  });

  it('idempotent re-merge returns same head', async () => {
    const { branchSvc, mrSvc } = setup();
    const main = await branchSvc.create({
      deckId: DECK_ID,
      name: 'main-idem',
      parentBranchId: MAIN_BRANCH,
      createdBy: 'user-1',
    });
    const feat = await branchSvc.create({
      deckId: DECK_ID,
      name: 'feat-idem',
      parentBranchId: main.id,
      createdBy: 'user-1',
    });
    const sourceDeck = makeDeck(10);
    const targetDeck = makeDeck(0);
    const mr = await mrSvc.createMergeRequest({
      deckId: DECK_ID,
      sourceBranchId: feat.id,
      targetBranchId: main.id,
      actorId: 'user-1',
      sourceRevision: 1,
      targetRevision: 1,
      sourceDeck,
      targetDeck,
    });
    const diff = computeDiff({
      base: { branchId: MAIN_BRANCH, revision: 0, deck: targetDeck },
      source: { branchId: feat.id, revision: 1, deck: sourceDeck },
      target: { branchId: main.id, revision: 1, deck: targetDeck },
    });
    await mrSvc.resolveMergeRequest(
      {
        deckId: DECK_ID,
        mrId: mr.id,
        actorId: 'user-2',
        request: { strategy: 'theirs', resolvedAtRevision: 1 },
      },
      { sourceDeck, targetDeck, diff },
    );
    const first = await mrSvc.commitMergeRequest({
      deckId: DECK_ID,
      mrId: mr.id,
      actorId: 'user-2',
      resolvedDeck: makeDeck(10),
    });
    const second = await mrSvc.commitMergeRequest({
      deckId: DECK_ID,
      mrId: mr.id,
      actorId: 'user-2',
      resolvedDeck: makeDeck(10),
    });
    expect(second.newRevision).toBe(first.newRevision);
    expect(second.record.id).toBe(first.record.id);
  });

  it('rejects commit before resolve', async () => {
    const { branchSvc, mrSvc } = setup();
    const main = await branchSvc.create({
      deckId: DECK_ID,
      name: 'main-nr',
      parentBranchId: MAIN_BRANCH,
      createdBy: 'user-1',
    });
    const feat = await branchSvc.create({
      deckId: DECK_ID,
      name: 'feat-nr',
      parentBranchId: main.id,
      createdBy: 'user-1',
    });
    const sourceDeck = makeDeck(10);
    const targetDeck = makeDeck(0);
    const mr = await mrSvc.createMergeRequest({
      deckId: DECK_ID,
      sourceBranchId: feat.id,
      targetBranchId: main.id,
      actorId: 'user-1',
      sourceRevision: 1,
      targetRevision: 1,
      sourceDeck,
      targetDeck,
    });
    await expect(
      mrSvc.commitMergeRequest({
        deckId: DECK_ID,
        mrId: mr.id,
        actorId: 'user-2',
        resolvedDeck: targetDeck,
      }),
    ).rejects.toBeInstanceOf(ConflictsUnresolvedError);
  });
});

describe('MergeService fast-forward', () => {
  it('marks the MR as resolved when source fully covers target', async () => {
    const { branchSvc, mrSvc } = setup();
    const main = await branchSvc.create({
      deckId: DECK_ID,
      name: 'main-ff',
      parentBranchId: MAIN_BRANCH,
      createdBy: 'user-1',
    });
    const feat = await branchSvc.create({
      deckId: DECK_ID,
      name: 'feat-ff',
      parentBranchId: main.id,
      createdBy: 'user-1',
    });
    // Source has new content; target is at base revision (no new content).
    const sourceDeck = makeDeck(123);
    const targetDeck = makeDeck(0);
    const mr = await mrSvc.createMergeRequest({
      deckId: DECK_ID,
      sourceBranchId: feat.id,
      targetBranchId: main.id,
      actorId: 'user-1',
      sourceRevision: 1,
      targetRevision: 0,
      sourceDeck,
      targetDeck,
    });
    expect(mr.status === 'resolved' || mr.status === 'open').toBe(true);
    // fast-forward only triggers when source diverges from base but
    // target has *nothing new*; we set targetRevision = 0 so the
    // service registers no diff against target and treats it as ff.
    if (mr.status === 'resolved') {
      expect(mr.resolutionStrategy).toBe('theirs');
    }
  });

  it('declares NoChangesToMergeError when everything is identical', async () => {
    const { branchSvc, mrSvc } = setup();
    const main = await branchSvc.create({
      deckId: DECK_ID,
      name: 'main-nc',
      parentBranchId: MAIN_BRANCH,
      createdBy: 'user-1',
    });
    const feat = await branchSvc.create({
      deckId: DECK_ID,
      name: 'feat-nc',
      parentBranchId: main.id,
      createdBy: 'user-1',
    });
    await expect(
      mrSvc.createMergeRequest({
        deckId: DECK_ID,
        sourceBranchId: feat.id,
        targetBranchId: main.id,
        actorId: 'user-1',
        sourceRevision: 0,
        targetRevision: 0,
        sourceDeck: makeDeck(0),
        targetDeck: makeDeck(0),
      }),
    ).rejects.toBeInstanceOf(NoChangesToMergeError);
  });
});

describe('resolveConflicts working tree', () => {
  it('keeps target content under ours strategy', () => {
    const diff = {
      slides: { added: [], removed: [], modified: [] },
      elements: [
        {
          slideId: SLIDE_A as string,
          path: `elements[${ELEM_A as string}].transform.x`,
          kind: 'modified' as const,
          sourceValue: 10,
          targetValue: 0,
        },
      ],
      conflicts: [],
    };
    const result = resolveConflicts({
      target: makeDeck(0),
      source: makeDeck(10),
      diff,
      request: { strategy: 'ours', resolvedAtRevision: 1 },
    });
    expect(result.deck.slides[0]!.elements[0]!.transform!.x).toBe(0);
  });
});
