import { describe, it, expect } from 'vitest';
import { validate } from './validate.js';
import type { DeckDocument, Element } from './generated/scene-graph.js';
import { asULID } from './generated/scene-graph.js';

const SLIDE_ID = asULID('01H00000000000000000000000');
const WORKSPACE_ID = asULID('01H00000000000000000000001');
const DECK_ID = asULID('01H00000000000000000000002');
const FRAME_ID = asULID('01H00000000000000000000003');
const TITLE_ID = asULID('01H00000000000000000000004');

function baseDeck(): DeckDocument {
  return {
    schemaVersion: '1.0.0',
    id: DECK_ID,
    tenantId: 'tenant-1',
    workspaceId: WORKSPACE_ID,
    title: 'Example deck',
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
            semanticId: 'hero',
            type: 'frame',
            name: 'Hero',
            parentId: null,
            aspect: { ratioW: 16, ratioH: 9 },
          },
          {
            id: TITLE_ID,
            semanticId: 'title',
            type: 'text',
            name: 'Title',
            parentId: null,
            text: { content: 'Hello' },
          },
        ],
      },
    ],
  };
}

describe('validate', () => {
  it('accepts a well-formed v1 deck document', () => {
    const result = validate(baseDeck());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects malformed documents with descriptive errors', () => {
    const result = validate({});
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects unknown layer types', () => {
    const doc = baseDeck();
    doc.slides[0]!.elements.push({
      id: asULID('01H00000000000000000000099'),
      semanticId: 'bad',
      type: 'unknown' as 'frame',
      name: 'Bad',
      parentId: null,
    } as Element);
    const result = validate(doc);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path.endsWith('.type'))).toBe(true);
  });

  it('rejects duplicate element ids on a slide', () => {
    const doc = baseDeck();
    doc.slides[0]!.elements.push({
      id: FRAME_ID,
      semanticId: 'another_frame',
      type: 'frame',
      name: 'Another frame',
      parentId: null,
      aspect: { ratioW: 4, ratioH: 3 },
    });
    const result = validate(doc);
    expect(result.errors.some((e) => e.code === 'duplicate_id')).toBe(true);
  });

  it('rejects duplicate element semantic ids on a slide', () => {
    const doc = baseDeck();
    doc.slides[0]!.elements.push({
      id: asULID('01H00000000000000000000098'),
      semanticId: 'title',
      type: 'text',
      name: 'Other title',
      parentId: null,
      text: { content: 'Same id' },
    });
    const result = validate(doc);
    expect(
      result.errors.some((e) => e.code === 'semantic_address_collision'),
    ).toBe(true);
  });

  it('rejects empty slides array', () => {
    const doc = baseDeck();
    doc.slides = [];
    const result = validate(doc);
    expect(result.valid).toBe(false);
  });

  it('accepts a component element with a valid ComponentRef', () => {
    const doc = baseDeck();
    doc.slides[0]!.elements.push({
      id: asULID('01H00000000000000000000097'),
      semanticId: 'stat_card',
      type: 'component',
      name: 'Stat card',
      parentId: null,
      transform: { x: 100, y: 100, w: 320, h: 160, rotation: 0 },
      component: {
        catalogId: 'domio.stat-card',
        version: '1.0.0',
        variant: 'light',
        props: { value: 42, label: 'Revenue' },
      },
    });
    const result = validate(doc);
    expect(result.valid).toBe(true);
  });

  it('accepts an element carrying the optional element_role magic-move key', () => {
    const doc = baseDeck();
    doc.slides[0]!.elements.push({
      id: asULID('01H00000000000000000000098'),
      semanticId: 'hero_title',
      element_role: 'deck-title',
      type: 'frame',
      name: 'Hero title',
      parentId: null,
      aspect: { ratioW: 16, ratioH: 9 },
      transform: { x: 100, y: 100, w: 320, h: 160, rotation: 0 },
    });
    const result = validate(doc);
    expect(result.valid).toBe(true);
  });

  it('rejects a component element with a missing or malformed ComponentRef', () => {
    const doc = baseDeck();
    doc.slides[0]!.elements.push({
      id: asULID('01H00000000000000000000096'),
      semanticId: 'broken_stat',
      type: 'component',
      name: 'Broken stat',
      parentId: null,
      component: { catalogId: '', version: 'not-a-version', props: [] as unknown as Record<string, unknown> },
    } as Element);
    const result = validate(doc);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path.endsWith('.component.version'))).toBe(true);
    expect(result.errors.some((e) => e.path.endsWith('.component.props'))).toBe(true);
  });

  it('enforces the schemaVersion on the structural validator by default', () => {
    const doc = { ...baseDeck(), schemaVersion: '0.9.0' };
    const result = validate(doc);
    expect(result.errors.some((e) => e.code === 'schema_version_mismatch')).toBe(true);
  });

  it('can be relaxed with ignoreVersion: true (used by the loader)', () => {
    const doc = { ...baseDeck(), schemaVersion: '0.9.0' };
    const result = validate(doc, { ignoreVersion: true });
    expect(result.valid).toBe(true);
  });
});
