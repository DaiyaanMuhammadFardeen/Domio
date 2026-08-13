import { describe, it, expect } from 'vitest';
import { toggleFlag, setFlag } from '../src/selection/lock-hide.js';
import { asULID, type DeckDocument, type Element } from '@domio/schema';

const DECK_ID = asULID('01H00000000000000000000000');
const SLIDE_ID = asULID('01H00000000000000000000001');
const A = asULID('01H00000000000000000000010');

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
            id: A,
            semanticId: 'a',
            type: 'frame',
            name: 'A',
            parentId: null,
            z: 0,
            transform: { x: 0, y: 0, w: 100, h: 100, rotation: 0, scale: 1 },
            aspect: { ratioW: 1, ratioH: 1 },
          } satisfies Element,
        ],
      },
    ],
  };
}

describe('lock/hide', () => {
  it('toggleFlag flips the locked flag', () => {
    const doc = buildDoc();
    const next = toggleFlag(doc, A, 'locked');
    expect(next.slides[0]!.elements[0]!.locked).toBe(true);
    const undone = toggleFlag(next, A, 'locked');
    expect(undone.slides[0]!.elements[0]!.locked).toBe(false);
  });

  it('toggleFlag flips the hidden flag', () => {
    const doc = buildDoc();
    const next = toggleFlag(doc, A, 'hidden');
    expect(next.slides[0]!.elements[0]!.hidden).toBe(true);
  });

  it('setFlag sets the value explicitly', () => {
    const doc = buildDoc();
    const next = setFlag(doc, A, 'locked', true);
    expect(next.slides[0]!.elements[0]!.locked).toBe(true);
    const cleared = setFlag(next, A, 'locked', false);
    expect(cleared.slides[0]!.elements[0]!.locked).toBe(false);
  });
});
