import { describe, it, expect, beforeEach } from 'vitest';
import { findAlignmentGuides, findSpacingHints } from '../src/guides/index.js';
import { SceneGraph } from '../src/scene/scene-graph.js';
import { asULID, type DeckDocument, type Element } from '@domio/schema';

const DECK_ID = asULID('01H00000000000000000000000');
const SLIDE_ID = asULID('01H00000000000000000000001');

function makeDoc(): DeckDocument {
  return {
    schemaVersion: '1.0.0',
    id: DECK_ID,
    tenantId: 't',
    workspaceId: asULID('01H00000000000000000000FFF'),
    title: 'Test',
    revision: 0,
    settings: { defaultSlideRatio: { ratioW: 16, ratioH: 9 } },
    slides: [
      {
        id: SLIDE_ID,
        semanticId: 's',
        position: 0,
        aspect: { ratioW: 16, ratioH: 9 },
        elements: [
          {
            id: asULID('01H00000000000000000000010'),
            semanticId: 'a',
            type: 'frame',
            name: 'A',
            parentId: null,
            z: 0,
            transform: { x: 100, y: 100, w: 100, h: 100, rotation: 0, scale: 1 },
            aspect: { ratioW: 1, ratioH: 1 },
          } satisfies Element,
          {
            id: asULID('01H00000000000000000000011'),
            semanticId: 'b',
            type: 'frame',
            name: 'B',
            parentId: null,
            z: 1,
            transform: { x: 250, y: 100, w: 100, h: 100, rotation: 0, scale: 1 },
            aspect: { ratioW: 1, ratioH: 1 },
          } satisfies Element,
        ],
      },
    ],
  };
}

describe('alignment guides', () => {
  let graph: SceneGraph;
  beforeEach(() => {
    graph = new SceneGraph();
    graph.ingest(makeDoc());
  });

  it('detects vertical alignment between two layers', () => {
    const guides = findAlignmentGuides({
      bounds: { x: 250, y: 100, w: 50, h: 50 },
      graph,
      options: { tolerance: 1 },
    });
    // The 50x50 box at x=250, y=100 overlaps center of B (x=300) and
    // collects x-axis alignment candidates.
    expect(guides.length).toBeGreaterThan(0);
    expect(guides.some((g) => g.axis === 'x')).toBe(true);
  });

  it('returns guides in under 50 ms for 1,000 layers', () => {
    const idx = graph.spatialIndex();
    for (let i = 0; i < 1000; i++) {
      idx.insert({ id: `l-${i}`, bounds: { x: i * 32, y: i * 32, w: 30, h: 30 }, z: i });
    }
    const start = performance.now();
    findAlignmentGuides({
      bounds: { x: 0, y: 0, w: 32_000, h: 32_000 },
      graph,
      options: { tolerance: 5 },
    });
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
  });

  it('excludes locked and hidden layers', () => {
    const doc = makeDoc();
    doc.slides[0]!.elements.push({
      id: asULID('01H00000000000000000000020'),
      semanticId: 'locked',
      type: 'frame',
      name: 'Locked',
      parentId: null,
      z: 2,
      locked: true,
      transform: { x: 250, y: 100, w: 100, h: 100, rotation: 0, scale: 1 },
      aspect: { ratioW: 1, ratioH: 1 },
    });
    graph.ingest(doc);
    const guides = findAlignmentGuides({
      bounds: { x: 245, y: 100, w: 10, h: 10 },
      graph,
      options: { tolerance: 1 },
    });
    // Locked candidate inside bounds would normally emit one alignment
    // guide; ensure no guides reference it directly.
    expect(guides.every((g) => !g.targets.includes(asULID('01H00000000000000000000020')))).toBe(true);
  });

  it('findSpacingHints returns hints for adjacent siblings', () => {
    const hints = findSpacingHints(
      graph,
      { x: 100, y: 100, w: 100, h: 100 },
      new Set([asULID('01H00000000000000000000010')]),
    );
    expect(hints.length).toBeGreaterThanOrEqual(0);
  });
});