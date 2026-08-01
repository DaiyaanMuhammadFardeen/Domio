import { describe, it, expect } from 'vitest';
import { groupElements, ungroupElements } from '../src/selection/group.js';
import { asULID, type DeckDocument, type Element } from '@domio/schema';

const DECK_ID = asULID('01H00000000000000000000000');
const SLIDE_ID = asULID('01H00000000000000000000001');
const A = asULID('01H00000000000000000000010');
const B = asULID('01H00000000000000000000011');
const GROUP_ID = asULID('01H00000000000000000000020');

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
            transform: { x: 0, y: 0, w: 50, h: 50, rotation: 0, scale: 1 },
            aspect: { ratioW: 1, ratioH: 1 },
          } satisfies Element,
          {
            id: B,
            semanticId: 'b',
            type: 'frame',
            name: 'B',
            parentId: null,
            z: 1,
            transform: { x: 100, y: 100, w: 50, h: 50, rotation: 0, scale: 1 },
            aspect: { ratioW: 1, ratioH: 1 },
          } satisfies Element,
        ],
      },
    ],
  };
}

describe('group / ungroup', () => {
  it('groups two elements with absolute transforms preserved', () => {
    const doc = buildDoc();
    const result = groupElements({ doc, ids: [A, B], newGroupId: GROUP_ID });
    const slide = result.doc.slides[0]!;
    const group = slide.elements.find((el) => el.id === GROUP_ID)!;
    expect(group.type).toBe('group');
    expect(group.transform?.w).toBe(150);
    expect(group.transform?.h).toBe(150);
    const a = slide.elements.find((el) => el.id === A)!;
    const b = slide.elements.find((el) => el.id === B)!;
    expect(a.parentId).toBe(GROUP_ID);
    expect(b.parentId).toBe(GROUP_ID);
    expect(a.transform?.x).toBe(0);
    expect(b.transform?.x).toBe(100);
  });

  it('ungroups and preserves the original parent', () => {
    const doc = buildDoc();
    const grouped = groupElements({ doc, ids: [A, B], newGroupId: GROUP_ID }).doc;
    const result = ungroupElements({ doc: grouped, groupId: GROUP_ID });
    const slide = result.doc.slides[0]!;
    expect(slide.elements.find((el) => el.id === GROUP_ID)).toBeUndefined();
    const a = slide.elements.find((el) => el.id === A)!;
    const b = slide.elements.find((el) => el.id === B)!;
    expect(a.parentId).toBeNull();
    expect(b.parentId).toBeNull();
    expect(a.transform?.x).toBe(0);
    expect(b.transform?.x).toBe(100);
  });
});