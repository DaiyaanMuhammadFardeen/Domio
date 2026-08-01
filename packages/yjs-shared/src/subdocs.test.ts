import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { SubDocRegistry, ensureSlide, serializeSlide, createDeckDocs } from './subdocs.js';
import type { Slide, ULID } from '@domio/schema';

// ----- Helpers -----

function ulid(value: string): ULID {
  return value as ULID;
}

function makeFixture(): Slide {
  return {
    id: ulid('01HXYZ00000000000000000A1'),
    semanticId: 'intro',
    position: 0,
    aspect: { ratioW: 16, ratioH: 9 },
    title: 'Introduction',
    notes: 'Speaker notes here',
    elements: [
      {
        id: ulid('01HXYZ00000000000000000B1'),
        semanticId: 'title',
        name: 'Title Text',
        type: 'text',
        parentId: null,
        transform: { x: 100, y: 50, w: 400, h: 60 },
        text: { content: 'Hello World' },
      },
      {
        id: ulid('01HXYZ00000000000000000C1'),
        semanticId: 'bg',
        name: 'Background Image',
        type: 'image',
        parentId: null,
        transform: { x: 0, y: 0, w: 1920, h: 1080 },
        assetId: 'asset-bg-001',
        fit: 'cover',
      },
    ],
  };
}

// ----- Tests -----

describe('SubDocRegistry', () => {
  it('creates and returns stable sub-docs', () => {
    const doc = new Y.Doc();
    const registry = new SubDocRegistry(doc);

    const a = registry.getOrCreateSlide('intro');
    const b = registry.getOrCreateSlide('intro');
    expect(a).toBe(b);
    expect(registry.has('intro')).toBe(true);
    expect(registry.keys()).toContain('intro');
    doc.destroy();
  });

  it('returns different docs for different keys', () => {
    const doc = new Y.Doc();
    const registry = new SubDocRegistry(doc);

    const slideA = registry.getOrCreateSlide('intro');
    const slideB = registry.getOrCreateSlide('conclusion');
    expect(slideA).not.toBe(slideB);
    expect(registry.keys()).toHaveLength(2);
    doc.destroy();
  });

  it('delete removes a sub-doc', () => {
    const doc = new Y.Doc();
    const registry = new SubDocRegistry(doc);

    registry.getOrCreateSlide('intro');
    expect(registry.has('intro')).toBe(true);
    const removed = registry.delete('intro');
    expect(removed).toBe(true);
    expect(registry.has('intro')).toBe(false);
    doc.destroy();
  });
});

describe('ensureSlide', () => {
  it('seeds meta, aspect, elements, zOrder, and text into the Y.Doc', () => {
    const doc = new Y.Doc();
    const fixture = makeFixture();
    ensureSlide(doc, fixture);

    const meta = doc.getMap('meta');
    expect(meta.get('id')).toBe(fixture.id);
    expect(meta.get('semanticId')).toBe('intro');
    expect(meta.get('position')).toBe(0);
    expect(meta.get('title')).toBe('Introduction');
    expect(meta.get('notes')).toBe('Speaker notes here');

    const aspect = doc.getMap('aspect');
    expect(aspect.get('ratioW')).toBe(16);
    expect(aspect.get('ratioH')).toBe(9);

    const zOrder = doc.getArray<string>('zOrder');
    expect(zOrder.length).toBe(2);
    expect(zOrder.get(0)).toBe(fixture.elements[0]!.id);
    expect(zOrder.get(1)).toBe(fixture.elements[1]!.id);

    const textFragment = doc.getText(`text:${fixture.elements[0]!.id}`);
    expect(textFragment.toString()).toBe('Hello World');

    doc.destroy();
  });

  it('is idempotent — calling twice does not overwrite', () => {
    const doc = new Y.Doc();
    const fixture = makeFixture();
    ensureSlide(doc, fixture);

    // Mutate text
    const textFragment = doc.getText(`text:${fixture.elements[0]!.id}`);
    textFragment.insert(5, ' Cruel');

    // Call ensureSlide again — should be a no-op
    ensureSlide(doc, fixture);
    expect(textFragment.toString()).toBe('Hello Cruel World');
    doc.destroy();
  });
});

describe('serializeSlide', () => {
  it('round-trips element ids, order, transforms, and text content', () => {
    const doc = new Y.Doc();
    const fixture = makeFixture();
    ensureSlide(doc, fixture);

    const result = serializeSlide(doc);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(fixture.id);
    expect(result!.semanticId).toBe('intro');
    expect(result!.position).toBe(0);
    expect(result!.aspect).toEqual({ ratioW: 16, ratioH: 9 });
    expect(result!.title).toBe('Introduction');
    expect(result!.notes).toBe('Speaker notes here');

    // Elements should be in zOrder (insertion order)
    expect(result!.elements).toHaveLength(2);
    const first = result!.elements[0]!;
    expect(first.id).toBe(fixture.elements[0]!.id);
    expect(first.type).toBe('text');
    expect(first.transform).toEqual({ x: 100, y: 50, w: 400, h: 60 });

    if (first.type === 'text') {
      expect((first as { text: { content: string } }).text.content).toBe('Hello World');
    }

    const second = result!.elements[1]!;
    expect(second.id).toBe(fixture.elements[1]!.id);
    expect(second.type).toBe('image');

    doc.destroy();
  });

  it('returns null for an unseeded doc', () => {
    const doc = new Y.Doc();
    expect(serializeSlide(doc)).toBeNull();
    doc.destroy();
  });

  it('zOrder positions map to z values', () => {
    const doc = new Y.Doc();
    const fixture = makeFixture();
    ensureSlide(doc, fixture);

    const result = serializeSlide(doc)!;
    // z values should be sequential (0, 1) matching the zOrder insertion
    expect(result.elements[0]!.z).toBe(0);
    expect(result.elements[1]!.z).toBe(1);
    doc.destroy();
  });
});

describe('createDeckDocs', () => {
  it('creates a deck root with seeded slide docs', () => {
    const slides: Slide[] = [
      makeFixture(),
      {
        id: ulid('01HXYZ00000000000000000D1'),
        semanticId: 'conclusion',
        position: 1,
        aspect: { ratioW: 16, ratioH: 9 },
        elements: [],
      },
    ];

    const { deckRoot, slideDocs, themeDocs } = createDeckDocs('deck-001', slides);

    expect(deckRoot).toBeInstanceOf(Y.Doc);
    expect(slideDocs.size).toBe(2);
    expect(slideDocs.has('intro')).toBe(true);
    expect(slideDocs.has('conclusion')).toBe(true);
    expect(themeDocs.size).toBe(0);

    // Verify slide content was seeded
    const introDoc = slideDocs.get('intro')!;
    const meta = introDoc.getMap('meta');
    expect(meta.get('semanticId')).toBe('intro');

    deckRoot.destroy();
    for (const d of slideDocs.values()) d.destroy();
  });
});
