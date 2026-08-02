/**
 * Component pack tests — every catalog entry must:
 *  - resolve defaults that validate against its props schema,
 *  - build valid scene-graph elements (StructuralValidator),
 *  - expand deterministically (stable ids per instance seed),
 *  - produce finite, in-bounds transforms.
 */

import { describe, it, expect } from 'vitest';
import type { ComponentLayer, DeckDocument, Element } from '@domio/schema';
import { StructuralValidator, DECK_SCHEMA_VERSION, asULID } from '@domio/schema';
import { validateProps } from '@domio/schema-prop';
import { CATALOG, getComponent, searchComponents, listByCategory, listCategories } from './catalog.js';
import { expandComponent } from './expand.js';
import { DEFAULT_ACCENT } from './tokens.js';

const validator = new StructuralValidator();

const ULID = asULID('00000000000000000000000001');

function makeLayer(
  catalogId: string,
  props: Record<string, unknown>,
  opts: { variant?: string; x?: number; y?: number; w?: number; h?: number } = {},
): ComponentLayer {
  const def = getComponent(catalogId)!;
  return {
    id: ULID,
    semanticId: 'instance',
    type: 'component',
    name: 'instance',
    parentId: null,
    transform: {
      x: opts.x ?? 100,
      y: opts.y ?? 80,
      w: opts.w ?? def.size.w,
      h: opts.h ?? def.size.h,
      rotation: 0,
    },
    component: { catalogId, version: def.version, ...(opts.variant ? { variant: opts.variant } : {}), props },
  };
}

function asDeck(elements: Element[]): DeckDocument {
  return {
    schemaVersion: DECK_SCHEMA_VERSION,
    id: ULID,
    tenantId: 'tenant-test',
    workspaceId: ULID,
    title: 'test',
    revision: 1,
    settings: { defaultSlideRatio: { ratioW: 16, ratioH: 9 } },
    slides: [{ id: ULID, semanticId: 'slide-1', position: 0, aspect: { ratioW: 16, ratioH: 9 }, elements }],
  };
}

describe('catalog registry', () => {
  it('registers every curated component', () => {
    expect(CATALOG.length).toBeGreaterThanOrEqual(20);
    expect(CATALOG.length).toBe(25);
  });

  it('has unique catalog ids and semver versions', () => {
    const ids = CATALOG.map((d) => d.catalogId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const def of CATALOG) {
      expect(def.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(def.catalogId).toMatch(/^[a-z0-9]+\.[a-z0-9-]+$/);
    }
  });

  it('resolves by catalog id and searches', () => {
    expect(getComponent('domio.stat-card')?.name).toBe('Stat Card');
    expect(getComponent('domio.missing')).toBeUndefined();
    expect(searchComponents('donut').map((d) => d.catalogId)).toContain('domio.donut-chart');
    expect(searchComponents('').length).toBe(CATALOG.length);
  });

  it('groups categories with every entry in exactly one', () => {
    const categories = listCategories();
    for (const c of categories) {
      expect(listByCategory(c).length).toBeGreaterThan(0);
    }
    const total = categories.reduce((sum, c) => sum + listByCategory(c).length, 0);
    expect(total).toBe(CATALOG.length);
  });

  it('exposes valid light/dark variant sets', () => {
    for (const def of CATALOG) {
      const ids = def.variants.map((v) => v.id);
      expect(ids).toContain(def.defaultVariant);
      expect(ids).toContain('light');
      expect(ids).toContain('dark');
    }
  });
});

describe('props schemas', () => {
  it.each(CATALOG.map((d) => [d.catalogId, d] as const))('%s — defaults resolve and validate', (_id, def) => {
    const { valid, value } = validateProps(def.propsSchema, {}, { coerce: true, fillDefaults: true });
    expect(valid).toBe(true);
    expect(value).toBeDefined();
  });

  it.each(CATALOG.map((d) => [d.catalogId, d] as const))('%s — required props are enforced', (_id, def) => {
    const required = def.propsSchema.required ?? [];
    if (required.length === 0) return;
    const { valid, errors } = validateProps(def.propsSchema, {}, { fillDefaults: false });
    expect(valid).toBe(false);
    expect(errors.some((e) => e.path === required[0] && e.code === 'required')).toBe(true);
  });

  it.each(CATALOG.map((d) => [d.catalogId, d] as const))('%s — rejects unknown props when additionalProperties is false', (_id, def) => {
    if (def.propsSchema.additionalProperties !== false) return;
    const { valid } = validateProps(def.propsSchema, { ...def.propsSchema.required?.reduce((a, k) => ({ ...a, [k]: 'x' }), {}), __bogus: 1 });
    expect(valid).toBe(false);
  });
});

describe('builders produce valid scene-graph', () => {
  it.each(CATALOG.map((d) => [d.catalogId, d] as const))('%s — default build passes StructuralValidator', (_id, def) => {
    const { value: props } = validateProps(def.propsSchema, {}, { coerce: true, fillDefaults: true });
    const ctx = {
      variantId: def.defaultVariant,
      id: (() => {
        let n = 0;
        return () => asULID(`00000000000000000000000000${n++}`.slice(-26));
      })(),
      semanticId: (role: string) => `t.${role}`,
    };
    const elements = def.build(props, ctx);
    expect(elements.length).toBeGreaterThan(0);
    const result = validator.validate(asDeck(elements));
    expect(result.errors.filter((e) => e.code !== 'schema_version_mismatch')).toEqual([]);
    for (const el of elements) {
      expect(Number.isFinite(el.transform.x)).toBe(true);
      expect(Number.isFinite(el.transform.y)).toBe(true);
      expect(el.transform.w).toBeGreaterThanOrEqual(0);
      expect(el.transform.h).toBeGreaterThanOrEqual(0);
    }
  });

  it.each(CATALOG.map((d) => [d.catalogId, d] as const))('%s — expansion is deterministic', (_id, def) => {
    const layer = makeLayer(def.catalogId, {});
    const a = expandComponent(layer);
    const b = expandComponent(layer);
    expect(a.map((e) => e.id)).toEqual(b.map((e) => e.id));
  });

  it.each(CATALOG.map((d) => [d.catalogId, d] as const))('%s — expansion scales into the layer box', (_id, def) => {
    const layer = makeLayer(def.catalogId, {}, { x: 0, y: 0, w: def.size.w * 2, h: def.size.h * 2 });
    const elements = expandComponent(layer);
    for (const el of elements) {
      expect(el.transform.x).toBeGreaterThanOrEqual(0);
      expect(el.transform.y).toBeGreaterThanOrEqual(0);
      expect(el.transform.x + el.transform.w).toBeLessThanOrEqual(def.size.w * 2 + 0.01);
      expect(el.transform.y + el.transform.h).toBeLessThanOrEqual(def.size.h * 2 + 0.01);
    }
  });
});

describe('expandComponent edge cases', () => {
  it('returns [] for unknown catalog ids', () => {
    const layer: ComponentLayer = {
      id: ULID,
      semanticId: 'instance',
      type: 'component',
      name: 'instance',
      parentId: null,
      transform: { x: 0, y: 0, w: 320, h: 160, rotation: 0 },
      component: { catalogId: 'domio.missing', version: '1.0.0', props: {} },
    };
    expect(expandComponent(layer)).toEqual([]);
  });

  it('honors the variant prop', () => {
    const def = getComponent('domio.stat-card')!;
    const light = expandComponent(makeLayer(def.catalogId, { accent: DEFAULT_ACCENT }, { variant: 'light' }));
    const dark = expandComponent(makeLayer(def.catalogId, { accent: DEFAULT_ACCENT }, { variant: 'dark' }));
    const lightBg = light.find((e) => e.semanticId === 'instance.card');
    const darkBg = dark.find((e) => e.semanticId === 'instance.card');
    expect(lightBg?.type).toBe('frame');
    expect(darkBg?.type).toBe('frame');
    if (lightBg?.type === 'frame' && darkBg?.type === 'frame') {
      expect(JSON.stringify(lightBg.fill)).not.toEqual(JSON.stringify(darkBg.fill));
    }
  });

  it('coerces prop values into the schema shape', () => {
    const def = getComponent('domio.progress-card')!;
    const layer = makeLayer(def.catalogId, { percent: '82', label: 'Target' });
    const elements = expandComponent(layer);
    const pct = elements.find((e) => e.semanticId === 'instance.percent');
    expect(pct?.type).toBe('text');
    if (pct?.type === 'text') {
      expect(pct.text.content).toBe('82%');
    }
  });
});
