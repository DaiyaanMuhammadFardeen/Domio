import { describe, it, expect, beforeEach } from 'vitest';
import { SceneGraph } from '../src/scene/scene-graph.js';
import { hitTest, hitTestAll } from '../src/scene/hit-test.js';
import { SpatialIndex } from '../src/scene/spatial-index.js';
import { asULID, type DeckDocument, type Element } from '@domio/schema';

const SLIDE_ID = asULID('01H00000000000000000000000');
const DECK_ID = asULID('01H00000000000000000000001');
const FRAME_ID = asULID('01H00000000000000000000002');
const TITLE_ID = asULID('01H00000000000000000000003');
const LOCKED_ID = asULID('01H00000000000000000000004');
const HIDDEN_ID = asULID('01H00000000000000000000005');

function buildDoc(): DeckDocument {
  return {
    schemaVersion: '1.0.0',
    id: DECK_ID,
    tenantId: 't',
    workspaceId: asULID('01H000000000000000000000FF'),
    title: 'Test',
    revision: 0,
    settings: { defaultSlideRatio: { ratioW: 16, ratioH: 9 } },
    slides: [
      {
        id: SLIDE_ID,
        semanticId: 'intro',
        position: 0,
        aspect: { ratioW: 16, ratioH: 9 },
        elements: [
          {
            id: FRAME_ID,
            semanticId: 'frame',
            type: 'frame',
            name: 'Frame',
            parentId: null,
            z: 0,
            transform: { x: 0, y: 0, w: 100, h: 100, rotation: 0, scale: 1 },
            aspect: { ratioW: 1, ratioH: 1 },
          } satisfies Element,
          {
            id: TITLE_ID,
            semanticId: 'title',
            type: 'text',
            name: 'Title',
            parentId: null,
            z: 1,
            transform: { x: 10, y: 10, w: 80, h: 80, rotation: 0, scale: 1 },
            text: { content: 'hi' },
          } satisfies Element,
          {
            id: LOCKED_ID,
            semanticId: 'locked',
            type: 'frame',
            name: 'Locked',
            parentId: null,
            z: 2,
            locked: true,
            transform: { x: 200, y: 0, w: 50, h: 50, rotation: 0, scale: 1 },
            aspect: { ratioW: 1, ratioH: 1 },
          } satisfies Element,
          {
            id: HIDDEN_ID,
            semanticId: 'hidden',
            type: 'frame',
            name: 'Hidden',
            parentId: null,
            z: 3,
            hidden: true,
            transform: { x: 400, y: 0, w: 50, h: 50, rotation: 0, scale: 1 },
            aspect: { ratioW: 1, ratioH: 1 },
          } satisfies Element,
        ],
      },
    ],
  };
}

describe('SpatialIndex', () => {
  it('queries the cell containing the bounds', () => {
    const idx = new SpatialIndex();
    idx.insert({ id: 'a', bounds: { x: 0, y: 0, w: 100, h: 100 }, z: 0 });
    idx.insert({ id: 'b', bounds: { x: 500, y: 500, w: 100, h: 100 }, z: 0 });
    const hits = idx.hits({ x: 0, y: 0, w: 100, h: 100 });
    expect(hits).toHaveLength(1);
    expect(hits[0]!.id).toBe('a');
  });

  it('hitTest returns top-most (highest z) item', () => {
    const idx = new SpatialIndex();
    idx.insert({ id: 'a', bounds: { x: 0, y: 0, w: 100, h: 100 }, z: 0 });
    idx.insert({ id: 'b', bounds: { x: 0, y: 0, w: 100, h: 100 }, z: 5 });
    const hit = idx.hitTest(50, 50);
    expect(hit?.id).toBe('b');
  });
});

describe('hitTest', () => {
  let graph: SceneGraph;
  beforeEach(() => {
    graph = new SceneGraph();
    graph.ingest(buildDoc());
  });

  it('selects the top-most element under the cursor', () => {
    const hit = hitTest(graph, 50, 50);
    expect(hit?.id).toBe(TITLE_ID);
  });

  it('skips locked layers', () => {
    const hit = hitTest(graph, 220, 25, { skipLocked: true });
    expect(hit).toBeNull();
  });

  it('skips hidden layers', () => {
    const hit = hitTest(graph, 420, 25, { skipHidden: true });
    expect(hit).toBeNull();
  });

  it('returns multiple layers via hitTestAll', () => {
    const hits = hitTestAll(graph, 50, 50);
    expect(hits.length).toBeGreaterThan(0);
  });
});