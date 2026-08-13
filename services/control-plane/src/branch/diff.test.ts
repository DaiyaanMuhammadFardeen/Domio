import { describe, it, expect } from 'vitest';
import { asULID, type DeckDocument, type Element, type Slide } from '@domio/schema';
import { computeDiff } from './diff.js';
import { resolveConflicts } from './resolver.js';

const DECK_ID = asULID('01H00000000000000000000000');
const WORKSPACE_ID = asULID('01H00000000000000000000001');
const SLIDE_A = asULID('01H000000000000000000000A0');
const SLIDE_B = asULID('01H000000000000000000000B0');
const ELEM_A = asULID('01H000000000000000000000AA');
const ELEM_B = asULID('01H000000000000000000000BB');

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

function makeDeck(overrides: Partial<DeckDocument> = {}): DeckDocument {
  const base: DeckDocument = {
    schemaVersion: '1.0.0',
    id: DECK_ID,
    tenantId: 'tenant-1',
    workspaceId: WORKSPACE_ID,
    title: 'deck',
    revision: 0,
    settings: { defaultSlideRatio: { ratioW: 16, ratioH: 9 } },
    slides: [makeSlide(SLIDE_A, 'intro', [makeText(0)])],
  };
  return { ...base, ...overrides };
}

describe('computeDiff', () => {
  it('returns empty summary when source/target/base are identical', () => {
    const deck = makeDeck();
    const summary = computeDiff({
      base: { branchId: 'main', revision: 1, deck },
      source: { branchId: 'feature/a', revision: 1, deck },
      target: { branchId: 'main', revision: 1, deck },
    });
    expect(summary).toEqual({
      slides: { added: [], removed: [], modified: [] },
      elements: [],
      conflicts: [],
    });
  });

  it('detects added slides', () => {
    const baseDeck = makeDeck();
    const sourceDeck = makeDeck({
      slides: [
        makeSlide(SLIDE_A, 'intro', [makeText(0)]),
        makeSlide(SLIDE_B, 'summary', [
          {
            id: ELEM_B,
            semanticId: 'closing',
            name: 'Closing',
            type: 'text',
            parentId: null,
            transform: { x: 0, y: 0, w: 100, h: 50 },
            text: { content: 'Bye' },
          } as Element,
        ]),
      ],
    });
    const summary = computeDiff({
      base: { branchId: 'main', revision: 1, deck: baseDeck },
      source: { branchId: 'feature/a', revision: 2, deck: sourceDeck },
      target: { branchId: 'main', revision: 1, deck: baseDeck },
    });
    expect(summary.slides.added).toHaveLength(1);
    expect(summary.slides.removed).toHaveLength(0);
  });

  it('classifies element property changes as conflicts when both diverge', () => {
    const baseDeck = makeDeck();
    const sourceDeck = makeDeck({
      slides: [makeSlide(SLIDE_A, 'intro', [makeText(10)])],
    });
    const targetDeck = makeDeck({
      slides: [makeSlide(SLIDE_A, 'intro', [makeText(20)])],
    });
    const summary = computeDiff({
      base: { branchId: 'main', revision: 1, deck: baseDeck },
      source: { branchId: 'feature/a', revision: 2, deck: sourceDeck },
      target: { branchId: 'main', revision: 2, deck: targetDeck },
    });
    expect(summary.elements.length).toBeGreaterThan(0);
    const conflict = summary.conflicts.find((c) => c.path.includes('transform.x'));
    expect(conflict).toBeTruthy();
    expect(conflict?.sourceValue).toBe(10);
    expect(conflict?.targetValue).toBe(20);
  });
});

describe('resolveConflicts', () => {
  it('theirs strategy picks source values for conflict paths', () => {
    const baseDeck = makeDeck();
    const sourceDeck = makeDeck({
      slides: [makeSlide(SLIDE_A, 'intro', [makeText(10)])],
    });
    const targetDeck = makeDeck({
      slides: [makeSlide(SLIDE_A, 'intro', [makeText(20)])],
    });
    const diff = computeDiff({
      base: { branchId: 'main', revision: 1, deck: baseDeck },
      source: { branchId: 'feature/a', revision: 2, deck: sourceDeck },
      target: { branchId: 'main', revision: 2, deck: targetDeck },
    });
    const result = resolveConflicts({
      target: targetDeck,
      source: sourceDeck,
      diff,
      request: { strategy: 'theirs', resolvedAtRevision: 2 },
    });
    const mergedElement = result.deck.slides[0]!.elements[0]! as Element & {
      transform: { x: number };
    };
    expect(mergedElement.transform.x).toBe(10);
    expect(result.unresolved).toHaveLength(0);
  });

  it('ours strategy keeps target values', () => {
    const baseDeck = makeDeck();
    const sourceDeck = makeDeck({
      slides: [makeSlide(SLIDE_A, 'intro', [makeText(10)])],
    });
    const targetDeck = makeDeck({
      slides: [makeSlide(SLIDE_A, 'intro', [makeText(20)])],
    });
    const diff = computeDiff({
      base: { branchId: 'main', revision: 1, deck: baseDeck },
      source: { branchId: 'feature/a', revision: 2, deck: sourceDeck },
      target: { branchId: 'main', revision: 2, deck: targetDeck },
    });
    const result = resolveConflicts({
      target: targetDeck,
      source: sourceDeck,
      diff,
      request: { strategy: 'ours', resolvedAtRevision: 2 },
    });
    const mergedElement = result.deck.slides[0]!.elements[0]! as Element & {
      transform: { x: number };
    };
    expect(mergedElement.transform.x).toBe(20);
    expect(result.unresolved).toHaveLength(0);
  });

  it('manual strategy requires resolutions for every conflict path', () => {
    const baseDeck = makeDeck();
    const sourceDeck = makeDeck({
      slides: [makeSlide(SLIDE_A, 'intro', [makeText(10)])],
    });
    const targetDeck = makeDeck({
      slides: [makeSlide(SLIDE_A, 'intro', [makeText(20)])],
    });
    const diff = computeDiff({
      base: { branchId: 'main', revision: 1, deck: baseDeck },
      source: { branchId: 'feature/a', revision: 2, deck: sourceDeck },
      target: { branchId: 'main', revision: 2, deck: targetDeck },
    });
    expect(() =>
      resolveConflicts({
        target: targetDeck,
        source: sourceDeck,
        diff,
        request: { strategy: 'manual', resolvedAtRevision: 2 },
      }),
    ).toThrow();
  });

  it('manual strategy applies chosen values when supplied', () => {
    const baseDeck = makeDeck();
    const sourceDeck = makeDeck({
      slides: [makeSlide(SLIDE_A, 'intro', [makeText(10)])],
    });
    const targetDeck = makeDeck({
      slides: [makeSlide(SLIDE_A, 'intro', [makeText(20)])],
    });
    const diff = computeDiff({
      base: { branchId: 'main', revision: 1, deck: baseDeck },
      source: { branchId: 'feature/a', revision: 2, deck: sourceDeck },
      target: { branchId: 'main', revision: 2, deck: targetDeck },
    });
    // We need to find the actual conflicting path; gather the first
    // conflict path so we can populate the manual resolution.
    const conflictPath = diff.conflicts[0]?.path;
    expect(conflictPath).toBeTruthy();
    const result = resolveConflicts({
      target: targetDeck,
      source: sourceDeck,
      diff,
      request: {
        strategy: 'manual',
        resolvedAtRevision: 2,
        resolutions: { [conflictPath!]: 200 },
      },
    });
    expect(result.unresolved).toHaveLength(0);
    expect(result.applied).toBe('manual');
  });
});
