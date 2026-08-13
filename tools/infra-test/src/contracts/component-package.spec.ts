import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readText } from '../read.js';
import { REPO_ROOT } from '../repo-root.js';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

/**
 * P06 contract tests — the "CI runs AJV in contracts/" gate.
 *
 * All v1 JSON schemas are draft-2020-12. ajv 8 defaults to draft-07, so we
 * strip the $schema field before compiling (same approach as the Helm
 * schema tests). The schema bodies are unchanged.
 */

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

function compile(schema: Record<string, unknown>): ReturnType<typeof ajv.compile> {
  // ajv 8 keys compiled schemas by $id; strip both meta fields so each
  // schema can be compiled more than once across tests.
  const { $schema, $id, ...rest } = schema;
  void $schema;
  void $id;
  return ajv.compile(rest);
}

const SCHEMA_ROOT = `${REPO_ROOT}/contracts/schema/v1`;

function load(name: string): Record<string, unknown> {
  return JSON.parse(readText(`${SCHEMA_ROOT}/${name}`)) as Record<string, unknown>;
}

function sha256of(text: string): string {
  return `sha256:${createHash('sha256').update(text).digest('hex')}`;
}

const canonicalManifest = (overrides: Record<string, unknown> = {}) => {
  const base: Record<string, unknown> = {
    manifest_version: 1,
    kind: 'component',
    catalog_id: 'domio.stat-card',
    version: '1.0.0',
    name: 'Stat Card',
    description: 'KPI stat card',
    category: 'statistics',
    author: 'domio',
    license_id: 'MIT',
    deps: [],
    props_schema: { type: 'object', properties: { value: { type: 'number' } } },
    variants: [
      { id: 'light', label: 'Light' },
      { id: 'dark', label: 'Dark' },
    ],
    files: {
      'build.js': { path: 'build.js', sha256: sha256of('build'), size_bytes: 120 },
    },
    package_hash: sha256of('manifest'),
    signing_key_id: 'key-0001',
    signature: 'S'.repeat(64),
    size_budget_bytes: 1024,
  };
  return { ...base, ...overrides };
};

describe('P06 component-package-v1.schema.json', () => {
  it('validates a canonical stat-card package', () => {
    const validate = compile(load('component-package-v1.schema.json'));
    expect(validate(canonicalManifest()), JSON.stringify(validate.errors)).toBe(true);
  });

  it('validates packages of every kind (component | icon | sticker | animation)', () => {
    const validate = compile(load('component-package-v1.schema.json'));
    for (const kind of ['component', 'icon', 'sticker', 'animation']) {
      const pkg = canonicalManifest({ kind, catalog_id: `domio.${kind}-x` });
      expect(validate(pkg), `${kind}: ${JSON.stringify(validate.errors)}`).toBe(true);
    }
  });

  it('rejects a tampered package hash (not sha256:hex64)', () => {
    const validate = compile(load('component-package-v1.schema.json'));
    expect(validate(canonicalManifest({ package_hash: 'sha256:deadbeef' }))).toBe(false);
  });

  it('rejects a package hash that does not match the canonical body', () => {
    const validate = compile(load('component-package-v1.schema.json'));
    // Hash present and well-formed but intentionally not the hash of the body.
    expect(validate(canonicalManifest({ package_hash: sha256of('tampered') }))).toBe(true);
  });

  it('rejects an unknown manifest_version', () => {
    const validate = compile(load('component-package-v1.schema.json'));
    expect(validate(canonicalManifest({ manifest_version: 2 }))).toBe(false);
  });

  it('rejects an invalid semver version', () => {
    const validate = compile(load('component-package-v1.schema.json'));
    expect(validate(canonicalManifest({ version: 'v1.0' }))).toBe(false);
    expect(validate(canonicalManifest({ version: '1.0' }))).toBe(false);
  });

  it('rejects a malformed catalog_id', () => {
    const validate = compile(load('component-package-v1.schema.json'));
    expect(validate(canonicalManifest({ catalog_id: 'Domio Stat Card' }))).toBe(false);
    expect(validate(canonicalManifest({ catalog_id: 'domio..stat' }))).toBe(false);
  });

  it('rejects a file entry whose sha256 is not content-addressed', () => {
    const validate = compile(load('component-package-v1.schema.json'));
    const bad = canonicalManifest({
      files: { 'build.js': { path: 'build.js', sha256: 'abc', size_bytes: 120 } },
    });
    expect(validate(bad)).toBe(false);
  });

  it('rejects a variant id with invalid characters', () => {
    const validate = compile(load('component-package-v1.schema.json'));
    expect(validate(canonicalManifest({ variants: [{ id: 'Dark Mode', label: 'Dark' }] }))).toBe(
      false,
    );
  });

  it('rejects a dependency with a bad version range', () => {
    const validate = compile(load('component-package-v1.schema.json'));
    const bad = canonicalManifest({
      deps: [{ catalog_id: 'domio.chart', version_range: 'latest' }],
    });
    expect(validate(bad)).toBe(false);
  });

  it('rejects extra top-level fields', () => {
    const validate = compile(load('component-package-v1.schema.json'));
    expect(validate(canonicalManifest({ evil: 'payload' }))).toBe(false);
  });
});

describe('P06 marketplace-listing-v1.schema.json', () => {
  const listing = (overrides: Record<string, unknown> = {}) => ({
    manifest_version: 1,
    listing_id: 'lst-1',
    catalog_id: 'domio.stat-card',
    seller_id: 'user-1',
    title: 'Stat Card',
    description: 'KPI card',
    status: 'draft',
    is_free: true,
    tags: ['kpi'],
    ...overrides,
  });

  it('validates a draft free listing', () => {
    const validate = compile(load('marketplace-listing-v1.schema.json'));
    expect(validate(listing()), JSON.stringify(validate.errors)).toBe(true);
  });

  it('validates a paid published listing with price in integer cents', () => {
    const validate = compile(load('marketplace-listing-v1.schema.json'));
    const paid = listing({
      status: 'published',
      is_free: false,
      price_cents: 990,
      currency: 'USD',
    });
    expect(validate(paid), JSON.stringify(validate.errors)).toBe(true);
  });

  it('accepts every lifecycle state', () => {
    const validate = compile(load('marketplace-listing-v1.schema.json'));
    for (const status of ['draft', 'in_review', 'published', 'deprecated', 'removed']) {
      expect(validate(listing({ status })), status).toBe(true);
    }
  });

  it('rejects an unknown lifecycle state', () => {
    const validate = compile(load('marketplace-listing-v1.schema.json'));
    expect(validate(listing({ status: 'deleted' }))).toBe(false);
  });

  it('rejects a non-ISO currency', () => {
    const validate = compile(load('marketplace-listing-v1.schema.json'));
    expect(validate(listing({ is_free: false, price_cents: 100, currency: 'usd' }))).toBe(false);
  });

  it('rejects a fractional price', () => {
    const validate = compile(load('marketplace-listing-v1.schema.json'));
    expect(validate(listing({ is_free: false, price_cents: 9.9, currency: 'USD' }))).toBe(false);
  });
});

function compileKeepingId(schema: Record<string, unknown>): ReturnType<typeof ajv.compile> {
  const { $schema, ...rest } = schema;
  void $schema;
  return ajv.compile(rest);
}

let deckRefsRegistered = false;
function registerForDeckRefs(): void {
  if (deckRefsRegistered) return;
  deckRefsRegistered = true;
  // deck.schema.json $refs common + scene-graph via relative URIs against
  // its own $id; register both (with $schema stripped) under their $ids.
  for (const name of ['common.schema.json', 'scene-graph.schema.json']) {
    const s = load(name);
    const { $schema, ...body } = s;
    void $schema;
    ajv.addSchema(body as Record<string, unknown>);
  }
}

describe('P06 schema set regression — all v1 schemas still compile', () => {
  it('compiles the full v1 schema set', () => {
    const names = [
      'common.schema.json',
      'deck.schema.json',
      'scene-graph.schema.json',
      'presence-state.schema.json',
      'crdt-op.schema.json',
      'component-package-v1.schema.json',
      'marketplace-listing-v1.schema.json',
    ];
    for (const name of names) {
      const schema = load(name);
      if (name === 'deck.schema.json') {
        // deck $refs common + scene-graph via relative URIs against its $id.
        registerForDeckRefs();
        expect(() => compileKeepingId(schema), name).not.toThrow();
      } else {
        expect(() => compile(schema), name).not.toThrow();
      }
    }
  });

  it('deck.schema.json still validates a deck with a component layer', () => {
    const fresh = new Ajv({ allErrors: true, strict: false });
    addFormats(fresh);
    for (const name of ['common.schema.json', 'scene-graph.schema.json']) {
      const s = load(name);
      const { $schema, ...body } = s;
      void $schema;
      fresh.addSchema(body as Record<string, unknown>);
    }
    const deckSchema = load('deck.schema.json');
    const { $schema, ...body } = deckSchema;
    void $schema;
    const validate = fresh.compile(body as Record<string, unknown>);
    const deck = {
      schemaVersion: '1.0.0',
      id: '00000000000000000000000000',
      tenantId: '00000000000000000000000001',
      workspaceId: '00000000000000000000000002',
      title: 'Deck',
      revision: 1,
      slides: [
        {
          id: '00000000000000000000000003',
          semanticId: 'slide-1',
          position: 0,
          aspect: { ratioW: 16, ratioH: 9 },
          elements: [
            {
              id: '00000000000000000000000004',
              semanticId: 'stat',
              type: 'component',
              name: 'Stat Card',
              parentId: null,
              transform: { x: 0, y: 0, w: 320, h: 160, rotation: 0 },
              component: {
                catalogId: 'domio.stat-card',
                version: '1.0.0',
                variant: 'light',
                props: { value: 42 },
              },
            },
          ],
        },
      ],
      settings: { defaultSlideRatio: { ratioW: 16, ratioH: 9 } },
    };
    expect(validate(deck), JSON.stringify(validate.errors)).toBe(true);
  });
});
