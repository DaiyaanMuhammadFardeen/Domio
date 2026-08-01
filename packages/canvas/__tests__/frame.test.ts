import { describe, it, expect } from 'vitest';
import { parentFrame, frameClip, frameContext } from '../src/frames/frame.js';
import { asULID, type DeckDocument, type Element } from '@domio/schema';

const DECK_ID = asULID('01H00000000000000000000000');
const SLIDE_ID = asULID('01H00000000000000000000001');
const OUTER = asULID('01H00000000000000000000010');
const INNER = asULID('01H00000000000000000000011');
const TEXT = asULID('01H00000000000000000000012');

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
            id: OUTER,
            semanticId: 'outer',
            type: 'frame',
            name: 'Outer',
            parentId: null,
            z: 0,
            transform: { x: 0, y: 0, w: 400, h: 400, rotation: 0, scale: 1 },
            aspect: { ratioW: 1, ratioH: 1 },
            clipContent: true,
          } satisfies Element,
          {
            id: INNER,
            semanticId: 'inner',
            type: 'frame',
            name: 'Inner',
            parentId: OUTER,
            z: 1,
            transform: { x: 50, y: 50, w: 100, h: 100, rotation: 0, scale: 1 },
            aspect: { ratioW: 1, ratioH: 1 },
          } satisfies Element,
          {
            id: TEXT,
            semanticId: 'text',
            type: 'text',
            name: 'Text',
            parentId: INNER,
            z: 2,
            transform: { x: 60, y: 60, w: 80, h: 20, rotation: 0, scale: 1 },
            text: { content: 'hi' },
          } satisfies Element,
        ],
      },
    ],
  };
}

describe('frames', () => {
  it('parentFrame returns the deepest frame ancestor', () => {
    const doc = buildDoc();
    expect(parentFrame(doc, TEXT)?.id).toBe(INNER);
    expect(parentFrame(doc, INNER)?.id).toBe(OUTER);
    expect(parentFrame(doc, OUTER)).toBeNull();
  });

  it('frameClip returns the bounds when clipContent is true', () => {
    const doc = buildDoc();
    const outer = doc.slides[0]!.elements.find((el) => el.id === OUTER)!;
    expect(frameClip(outer as Element & { type: 'frame' })).toEqual({
      x: 0,
      y: 0,
      w: 400,
      h: 400,
    });
  });

  it('frameContext returns the parent and children', () => {
    const doc = buildDoc();
    const ctx = frameContext(doc, OUTER);
    expect(ctx?.frame.id).toBe(OUTER);
    expect(ctx?.children).toHaveLength(1);
    expect(ctx?.parent).toBeNull();
  });
});