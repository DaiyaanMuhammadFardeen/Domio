import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryStore } from '../store/memory.js';
import { defaultDeps } from '../deps.js';
import { sha256Hex } from '../crypto/index.js';
import { publishPackage, getPackage, getPackageOrNull, listVersions, searchPackages, deprecatePackage, validatePropsSchema } from './catalog.js';

describe('catalog', () => {
  let deps: ReturnType<typeof defaultDeps>;

  beforeEach(() => {
    deps = defaultDeps(new InMemoryStore());
  });

  describe('validatePropsSchema', () => {
    it('returns empty schema for undefined', () => {
      const result = validatePropsSchema(undefined, 100);
      expect(result.schema).toEqual({ type: 'object', properties: {} });
      expect(result.props).toEqual([]);
    });

    it('valid schema returns props list', () => {
      const schema = {
        type: 'object',
        properties: {
          color: { type: 'string', default: '#000', 'x-domio-prop': { control: 'color' } },
          label: { type: 'string' },
        },
      };
      const result = validatePropsSchema(schema, 100);
      expect(result.props.length).toBe(2);
      const colorProp = result.props.find((p) => p.propKey === 'color')!;
      expect(colorProp.controlHint).toBe('color');
      expect(colorProp.required).toBe(false);
      expect(colorProp.default).toBe('#000');
      const labelProp = result.props.find((p) => p.propKey === 'label')!;
      expect(labelProp.required).toBe(false);
    });

    it('throws when exceeds maxProps', () => {
      const props: Record<string, unknown> = {};
      for (let i = 0; i < 51; i++) props[`p${i}`] = { type: 'string' };
      const schema = { type: 'object', properties: props };
      expect(() => validatePropsSchema(schema, 50)).toThrow('exceeds');
    });
  });

  describe('publishPackage', () => {
    it('publishes a new package', async () => {
      const result = await publishPackage(deps, {
        catalogId: 'comp.btn',
        version: '1.0.0',
        kind: 'component',
        name: 'Button',
      });
      expect(result.created).toBe(true);
      expect(result.pkg.catalogId).toBe('comp.btn');
    });

    it('updates an existing package (idempotent)', async () => {
      await publishPackage(deps, {
        catalogId: 'comp.btn', version: '1.0.0', kind: 'component', name: 'Button',
      });
      const result = await publishPackage(deps, {
        catalogId: 'comp.btn', version: '1.0.0', kind: 'component', name: 'Button v2',
      });
      expect(result.created).toBe(false);
    });

    it('throws for invalid catalogId', async () => {
      await expect(publishPackage(deps, {
        catalogId: 'Invalid_Catalog!',
        version: '1.0.0', kind: 'component', name: 'X',
      })).rejects.toThrow('Invalid catalogId');
    });

    it('throws for invalid semver', async () => {
      await expect(publishPackage(deps, {
        catalogId: 'comp.btn',
        version: 'not-semver', kind: 'component', name: 'X',
      })).rejects.toThrow('Invalid semver');
    });

    it('verifies file blobs exist', async () => {
      const bytes = new TextEncoder().encode('code');
      const hash = sha256Hex(bytes);
      await deps.store.putBlob({ sha256: hash, bytes, storedAt: Date.now() });
      const result = await publishPackage(deps, {
        catalogId: 'comp.btn', version: '1.0.0', kind: 'component', name: 'Button',
        files: { 'index.js': hash },
      });
      expect(result.pkg.files['index.js']).toBe(hash);
    });

    it('throws when blob missing', async () => {
      await expect(publishPackage(deps, {
        catalogId: 'comp.btn', version: '1.0.0', kind: 'component', name: 'X',
        files: { 'index.js': 'a'.repeat(64) },
      })).rejects.toThrow('Missing bundle blob');
    });

    it('throws when packageHash mismatch', async () => {
      await expect(publishPackage(deps, {
        catalogId: 'comp.btn', version: '1.0.0', kind: 'component', name: 'X',
        packageHash: 'wrong-hash',
      })).rejects.toThrow('packageHash does not match');
    });

    it('throws for invalid file hash format', async () => {
      await expect(publishPackage(deps, {
        catalogId: 'comp.btn', version: '1.0.0', kind: 'component', name: 'X',
        files: { 'index.js': 'not-a-hash' },
      })).rejects.toThrow('invalid sha256');
    });

    it('preserves deprecation from existing package', async () => {
      await publishPackage(deps, {
        catalogId: 'comp.btn', version: '1.0.0', kind: 'component', name: 'Btn',
      });
      // Deprecate it
      await deprecatePackage(deps, { catalogId: 'comp.btn', reason: 'old' });
      // Re-publish (should preserve deprecation)
      const result = await publishPackage(deps, {
        catalogId: 'comp.btn', version: '1.0.0', kind: 'component', name: 'Btn',
      });
      expect(result.pkg.deprecation).toBeDefined();
    });

    it('stores optional fields', async () => {
      const result = await publishPackage(deps, {
        catalogId: 'comp.btn', version: '1.0.0', kind: 'component', name: 'Btn',
        category: 'ui', author: 'Alice', licenseId: 'MIT',
        signingKeyId: 'key-1', signature: 'sig-1', sizeBudgetBytes: 1024,
      });
      expect(result.pkg.category).toBe('ui');
      expect(result.pkg.author).toBe('Alice');
      expect(result.pkg.licenseId).toBe('MIT');
      expect(result.pkg.signingKeyId).toBe('key-1');
      expect(result.pkg.signature).toBe('sig-1');
      expect(result.pkg.sizeBudgetBytes).toBe(1024);
    });
  });

  describe('getPackage', () => {
    it('returns package', async () => {
      await publishPackage(deps, {
        catalogId: 'comp.btn', version: '1.0.0', kind: 'component', name: 'Btn',
      });
      const pkg = await getPackage(deps, 'comp.btn', '1.0.0');
      expect(pkg.catalogId).toBe('comp.btn');
    });
    it('throws when not found', async () => {
      await expect(getPackage(deps, 'missing', '1.0.0')).rejects.toThrow('not found');
    });
  });

  describe('getPackageOrNull', () => {
    it('returns undefined when not found', async () => {
      const pkg = await getPackageOrNull(deps, 'missing', '1.0.0');
      expect(pkg).toBeUndefined();
    });
  });

  describe('listVersions', () => {
    it('returns all versions', async () => {
      await publishPackage(deps, { catalogId: 'comp.btn', version: '1.0.0', kind: 'component', name: 'Btn' });
      await publishPackage(deps, { catalogId: 'comp.btn', version: '2.0.0', kind: 'component', name: 'Btn' });
      const versions = await listVersions(deps, 'comp.btn');
      expect(versions.length).toBe(2);
    });
  });

  describe('searchPackages', () => {
    it('searches by query', async () => {
      await publishPackage(deps, { catalogId: 'comp.btn', version: '1.0.0', kind: 'component', name: 'Button' });
      const results = await searchPackages(deps, 'button');
      expect(results.length).toBe(1);
    });
  });

  describe('deprecatePackage', () => {
    it('deprecates a specific version', async () => {
      await publishPackage(deps, { catalogId: 'comp.btn', version: '1.0.0', kind: 'component', name: 'Btn' });
      const result = await deprecatePackage(deps, {
        catalogId: 'comp.btn', version: '1.0.0', reason: 'old', replaceWith: '2.0.0',
      });
      expect(result.deprecation).toBeDefined();
      expect(result.deprecation!.reason).toBe('old');
      expect(result.deprecation!.replaceWith).toBe('2.0.0');
    });

    it('deprecates all versions when no version specified', async () => {
      await publishPackage(deps, { catalogId: 'comp.btn', version: '1.0.0', kind: 'component', name: 'Btn' });
      await publishPackage(deps, { catalogId: 'comp.btn', version: '2.0.0', kind: 'component', name: 'Btn' });
      await deprecatePackage(deps, { catalogId: 'comp.btn', reason: 'retired' });
      const v1 = await getPackage(deps, 'comp.btn', '1.0.0');
      const v2 = await getPackage(deps, 'comp.btn', '2.0.0');
      expect(v1.deprecation).toBeDefined();
      expect(v2.deprecation).toBeDefined();
    });

    it('throws when no versions exist', async () => {
      await expect(deprecatePackage(deps, {
        catalogId: 'missing', reason: 'old',
      })).rejects.toThrow('not found');
    });
  });
});
