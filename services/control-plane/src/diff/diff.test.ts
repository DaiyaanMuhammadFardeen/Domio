import { describe, it, expect, vi } from 'vitest';
import { asULID, type DeckDocument, type Element, type Slide, type ULID } from '@domio/schema';
import { DiffService, NatsVisualDiffRenderer } from './index.js';
import { BranchService, MAIN_BRANCH } from '../branch/service.js';
import { InMemoryBranchRepository } from '../branch/dal.js';

const DECK_ID = asULID('01H00000000000000000000000');
const SLIDE = asULID('01H0000000000000000000000A');
const ELEM = asULID('01H0000000000000000000000B');

function makeText(x: number): Element {
  return {
    id: ELEM,
    semanticId: 'title',
    name: 'T',
    type: 'text',
    parentId: null,
    transform: { x, y: 0, w: 100, h: 50 },
    text: { content: 'hi' },
  };
}

function makeDeck(x: number): DeckDocument {
  return {
    schemaVersion: '1.0.0',
    id: DECK_ID,
    tenantId: 't',
    workspaceId: asULID('01H00000000000000000000001'),
    title: 'd',
    revision: 0,
    settings: { defaultSlideRatio: { ratioW: 16, ratioH: 9 } },
    slides: [
      {
        id: SLIDE,
        semanticId: 'intro',
        position: 0,
        aspect: { ratioW: 16, ratioH: 9 },
        elements: [makeText(x)],
      } satisfies Slide,
    ],
  };
}

function ids(): () => ULID {
  let n = 1;
  return () => asULID(`01H0000000000000000000000${n++}`);
}

async function setup(opts: { sourceX: number; targetX: number; baseX?: number }) {
  const repo = new InMemoryBranchRepository();
  const branchSvc = new BranchService(repo, ids());
  const mainBranch = await branchSvc.create({
    deckId: DECK_ID,
    name: 'main',
    parentBranchId: MAIN_BRANCH,
    createdBy: 'u',
  });
  const feature = await branchSvc.create({
    deckId: DECK_ID,
    name: 'feature/x',
    parentBranchId: mainBranch.id,
    createdBy: 'u',
  });
  const fetchDecks = vi.fn(async ({ branchId }: { branchId: string }) => {
    if (branchId === mainBranch.id) return makeDeck(opts.targetX);
    if (branchId === feature.id) return makeDeck(opts.sourceX);
    return makeDeck(opts.baseX ?? 0);
  });
  const svc = new DiffService({
    branchService: branchSvc,
    metricsSink: undefined,
    renderer: undefined,
  });
  return { branchSvc, mainBranch, feature, fetchDecks, svc };
}

describe('DiffService.compute', () => {
  it('returns empty summary for identical content', async () => {
    const { mainBranch, feature, fetchDecks, svc } = await setup({
      sourceX: 0,
      targetX: 0,
      baseX: 0,
    });
    const result = await svc.compute({
      deckId: DECK_ID,
      sourceBranchId: feature.id,
      targetBranchId: mainBranch.id,
      fetchDecks,
    });
    expect(result.diff.slides.added).toHaveLength(0);
    expect(result.diff.elements).toHaveLength(0);
    expect(result.isFastForward).toBe(true);
  });

  it('reports element changes for non-identical content', async () => {
    const { mainBranch, feature, fetchDecks, svc } = await setup({
      sourceX: 10,
      targetX: 0,
      baseX: 0,
    });
    const result = await svc.compute({
      deckId: DECK_ID,
      sourceBranchId: feature.id,
      targetBranchId: mainBranch.id,
      fetchDecks,
    });
    expect(result.diff.elements.length).toBeGreaterThan(0);
    expect(result.isFastForward).toBe(false);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('records metrics for diff calls', async () => {
    const { mainBranch, feature, fetchDecks, svc } = await setup({
      sourceX: 5,
      targetX: 0,
    });
    await svc.compute({
      deckId: DECK_ID,
      sourceBranchId: feature.id,
      targetBranchId: mainBranch.id,
      fetchDecks,
    });
    expect(typeof (svc as unknown as { metrics: unknown }).metrics).toBe('object');
  });

  it('handles missing decks gracefully', async () => {
    const repo = new InMemoryBranchRepository();
    const branchSvc = new BranchService(repo, ids());
    const mainBranch = await branchSvc.create({
      deckId: DECK_ID,
      name: 'main',
      parentBranchId: MAIN_BRANCH,
      createdBy: 'u',
    });
    const feat = await branchSvc.create({
      deckId: DECK_ID,
      name: 'feat',
      parentBranchId: mainBranch.id,
      createdBy: 'u',
    });
    const svc = new DiffService({ branchService: branchSvc });
    const result = await svc.compute({
      deckId: DECK_ID,
      sourceBranchId: feat.id,
      targetBranchId: mainBranch.id,
      fetchDecks: async () => null,
    });
    expect(result.diff.elements).toHaveLength(0);
    expect(result.isFastForward).toBe(false);
  });
});

describe('DiffService render', () => {
  it('throws without a renderer configured', async () => {
    const svc = new DiffService({
      branchService: new BranchService(),
    });
    await expect(
      svc.renderThumbnail({
        deckId: DECK_ID,
        revisionA: 1,
        revisionB: 2,
        zoom: 1,
      }),
    ).rejects.toThrow();
  });

  it('uses the configured renderer', async () => {
    const publisher = vi.fn().mockResolvedValue(undefined);
    const renderer = new NatsVisualDiffRenderer(publisher);
    const svc = new DiffService({
      branchService: new BranchService(),
      renderer,
    });
    const out = await svc.renderThumbnail({
      deckId: DECK_ID,
      revisionA: 1,
      revisionB: 2,
      zoom: 0.5,
    });
    expect(out.width).toBe(320);
    expect(out.height).toBe(180);
    expect(publisher).toHaveBeenCalled();
  });
});
