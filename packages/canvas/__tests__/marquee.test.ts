import { describe, it, expect, beforeEach } from 'vitest';
import { Selection, marqueeSelect } from '../src/selection/marquee.js';
import { SceneGraph } from '../src/scene/scene-graph.js';
import { asULID, type DeckDocument, type Element } from '@domio/schema';

const DECK_ID = asULID('01H00000000000000000000000');
const SLIDE_ID = asULID('01H00000000000000000000001');
const FRAME_A = asULID('01H00000000000000000000010');
const FRAME_B = asULID('01H00000000000000000000011');
const FRAME_LOCKED = asULID('01H00000000000000000000012');

function buildDoc(): DeckDocument {
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
            id: FRAME_A,
            semanticId: 'a',
            type: 'frame',
            name: 'A',
            parentId: null,
            z: 0,
            transform: { x: 0, y: 0, w: 100, h: 100, rotation: 0, scale: 1 },
            aspect: { ratioW: 1, ratioH: 1 },
          } satisfies Element,
          {
            id: FRAME_B,
            semanticId: 'b',
            type: 'frame',
            name: 'B',
            parentId: null,
            z: 1,
            transform: { x: 200, y: 0, w: 100, h: 100, rotation: 0, scale: 1 },
            aspect: { ratioW: 1, ratioH: 1 },
          } satisfies Element,
          {
            id: FRAME_LOCKED,
            semanticId: 'locked',
            type: 'frame',
            name: 'Locked',
            parentId: null,
            z: 2,
            locked: true,
            transform: { x: 400, y: 0, w: 100, h: 100, rotation: 0, scale: 1 },
            aspect: { ratioW: 1, ratioH: 1 },
          } satisfies Element,
        ],
      },
    ],
  };
}

describe('selection (marquee)', () => {
  let graph: SceneGraph;
  beforeEach(() => {
    graph = new SceneGraph();
    graph.ingest(buildDoc());
  });

  it('replaces the selection by default', () => {
    const next = marqueeSelect({
      rect: { x: 0, y: 0, w: 300, h: 100 },
      selection: Selection.from([FRAME_B]),
      graph,
    });
    expect(next.has(FRAME_A)).toBe(true);
    expect(next.has(FRAME_B)).toBe(true);
    expect(next.size()).toBe(2);
  });

  it('Shift adds to the selection', () => {
    const next = marqueeSelect({
      rect: { x: 0, y: 0, w: 300, h: 100 },
      selection: Selection.from([FRAME_B]),
      graph,
      modifiers: { shift: true },
    });
    expect(next.has(FRAME_A)).toBe(true);
    expect(next.has(FRAME_B)).toBe(true);
  });

  it('Alt subtracts from the selection', () => {
    const next = marqueeSelect({
      rect: { x: 0, y: 0, w: 300, h: 100 },
      selection: Selection.from([FRAME_A, FRAME_B]),
      graph,
      modifiers: { alt: true },
    });
    expect(next.has(FRAME_A)).toBe(false);
    expect(next.has(FRAME_B)).toBe(false);
  });

  it('skips locked layers', () => {
    const next = marqueeSelect({
      rect: { x: 0, y: 0, w: 1000, h: 1000 },
      selection: Selection.empty(),
      graph,
    });
    expect(next.has(FRAME_LOCKED)).toBe(false);
  });
});
