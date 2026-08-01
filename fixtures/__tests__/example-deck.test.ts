import { describe, it, expect } from 'vitest';
import fixture from '../example-deck.json';
import {
  DECK_SCHEMA_VERSION,
  DefaultAddressResolver,
  MigrationRegistry,
  SchemaMigrator,
  validate,
  type DeckDocument,
} from '@domio/schema';

describe('example-deck fixture', () => {
  const document = fixture as DeckDocument;

  it('loads as a DeckDocument with mixed aspect ratios', () => {
    expect(document.schemaVersion).toBe(DECK_SCHEMA_VERSION);
    expect(document.slides).toHaveLength(2);
    expect(document.slides.map((slide) => slide.aspect)).toEqual([
      { ratioW: 16, ratioH: 9 },
      { ratioW: 9, ratioH: 16 },
    ]);
  });

  it('contains the Phase 02 scene-graph slots', () => {
    const elements = document.slides.flatMap((slide) => slide.elements);
    expect(elements).toHaveLength(10);
    expect(elements.some((element) => element.type === 'autoLayout')).toBe(true);
    expect(elements.some((element) => element.componentInstance !== undefined)).toBe(true);
    expect(elements.some((element) => element.type === 'frame')).toBe(true);
    expect(elements.some((element) => element.type === 'group')).toBe(true);
    expect(elements.some((element) => element.type === 'vector')).toBe(true);
    expect(elements.some((element) => element.type === 'image')).toBe(true);
  });

  it('passes the typed structural validator', () => {
    const result = validate(document);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('resolves semantic addresses for every element', () => {
    const resolver = new DefaultAddressResolver();
    for (let slideIndex = 0; slideIndex < document.slides.length; slideIndex += 1) {
      const slide = document.slides[slideIndex]!;
      for (let elementIndex = 0; elementIndex < slide.elements.length; elementIndex += 1) {
        const address = resolver.addressOf(document, { slideIndex, elementIndex });
        expect(resolver.resolve(document, address)).toMatchObject({
          kind: 'element',
          slideIndex,
          elementIndex,
        });
      }
    }
  });

  it('supports lazy migration through the registry', () => {
    const registry = new MigrationRegistry();
    registry.register({
      from: '1.0.0',
      to: '1.1.0',
      direction: 'up',
      description: 'Add future optional metadata',
      apply: (doc) => ({ ...(doc as DeckDocument), extensions: { migrated: true } }),
    });
    const migrator = new SchemaMigrator('1.1.0', registry);
    const migrated = migrator.apply(document);
    expect(migrated.schemaVersion).toBe('1.1.0');
    expect(migrated.extensions).toEqual({ migrated: true });
  });
});
