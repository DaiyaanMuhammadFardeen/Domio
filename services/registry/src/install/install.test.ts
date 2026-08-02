import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryStore } from '../store/memory.js';
import { defaultDeps } from '../deps.js';
import { sha256Hex } from '../crypto/index.js';
import { installPackage, uninstallPackage, checkForUpdates } from './install.js';
import type { ComponentPackage, MarketplaceListing } from '../store/types.js';

describe('install', () => {
  let store: InMemoryStore;
  let deps: ReturnType<typeof defaultDeps>;

  beforeEach(() => {
    store = new InMemoryStore();
    deps = defaultDeps(store);
  });

  async function seedPackage(catalogId = 'comp.btn', version = '1.0.0'): Promise<ComponentPackage> {
    const fileBytes = new TextEncoder().encode('code');
    const fileHash = sha256Hex(fileBytes);
    await store.putBlob({ sha256: fileHash, bytes: fileBytes, storedAt: Date.now() });
    const pkg: ComponentPackage = {
      id: `${catalogId}:${version}`,
      catalogId,
      version,
      kind: 'component',
      name: `Test ${catalogId}`,
      description: '',
      propsSchema: { type: 'object', properties: {} },
      variants: [],
      files: { 'index.js': fileHash },
      packageHash: '',
      sizeBudgetBytes: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await store.putPackage(pkg);
    return pkg;
  }

  describe('installPackage', () => {
    it('installs a free component', async () => {
      await seedPackage();
      const result = await installPackage(deps, {
        workspaceId: 'ws-1', userId: 'u-1', catalogId: 'comp.btn',
      });
      expect(result.version).toBe('1.0.0');
      expect(result.item.catalogId).toBe('comp.btn');
      expect(result.bundleUrls.length).toBe(1);
      expect(result.updated).toBe(false);
    });

    it('installs paid component and issues license', async () => {
      await seedPackage();
      const listing: MarketplaceListing = {
        id: 'list-1', catalogId: 'comp.btn', sellerId: 's-1', title: 'Button', description: '',
        status: 'published', isFree: false, priceCents: 500, currency: 'usd', tags: [],
        createdAt: Date.now(), updatedAt: Date.now(),
      };
      await store.putListing(listing);
      const result = await installPackage(deps, {
        workspaceId: 'ws-1', userId: 'u-1', catalogId: 'comp.btn', seats: 3,
      });
      expect(result.licenseGrant).toBeDefined();
      expect(result.licenseGrant!.seats).toBe(3);
    });

    it('throws when component not found', async () => {
      await expect(installPackage(deps, {
        workspaceId: 'ws-1', userId: 'u-1', catalogId: 'missing',
      })).rejects.toThrow('not found');
    });

    it('throws when blob missing (tampered)', async () => {
      const pkg: ComponentPackage = {
        id: 'comp.tamper:1.0.0', catalogId: 'comp.tamper', version: '1.0.0', kind: 'component',
        name: 'Tamper', description: '',
        propsSchema: { type: 'object', properties: {} }, variants: [],
        files: { 'index.js': 'a'.repeat(64) }, packageHash: '', sizeBudgetBytes: 0,
        createdAt: Date.now(), updatedAt: Date.now(),
      };
      await store.putPackage(pkg);
      await expect(installPackage(deps, {
        workspaceId: 'ws-1', userId: 'u-1', catalogId: 'comp.tamper',
      })).rejects.toThrow('missing from store');
    });

    it('returns updated=true when updating existing install', async () => {
      await seedPackage('comp.btn', '1.0.0');
      const v2Bytes = new TextEncoder().encode('code-v2');
      const v2Hash = sha256Hex(v2Bytes);
      await store.putBlob({ sha256: v2Hash, bytes: v2Bytes, storedAt: Date.now() });
      const v2: ComponentPackage = {
        id: 'comp.btn:2.0.0', catalogId: 'comp.btn', version: '2.0.0', kind: 'component',
        name: 'Btn', description: '',
        propsSchema: { type: 'object', properties: {} }, variants: [],
        files: { 'index.js': v2Hash }, packageHash: '', sizeBudgetBytes: 0,
        createdAt: Date.now(), updatedAt: Date.now(),
      };
      await store.putPackage(v2);

      await installPackage(deps, { workspaceId: 'ws-1', userId: 'u-1', catalogId: 'comp.btn', version: '1.0.0' });
      const result = await installPackage(deps, { workspaceId: 'ws-1', userId: 'u-1', catalogId: 'comp.btn', version: '2.0.0' });
      expect(result.updated).toBe(true);
    });
  });

  describe('uninstallPackage', () => {
    it('removes an installed package', async () => {
      await seedPackage();
      await installPackage(deps, { workspaceId: 'ws-1', userId: 'u-1', catalogId: 'comp.btn' });
      await uninstallPackage(deps, 'u-1', 'ws-1', 'comp.btn');
    });
  });

  describe('checkForUpdates', () => {
    it('returns update info for installed items', async () => {
      await seedPackage('comp.btn', '1.0.0');
      const v2Bytes = new TextEncoder().encode('v2');
      const v2Hash = sha256Hex(v2Bytes);
      await store.putBlob({ sha256: v2Hash, bytes: v2Bytes, storedAt: Date.now() });
      await store.putPackage({
        id: 'comp.btn:2.0.0', catalogId: 'comp.btn', version: '2.0.0', kind: 'component',
        name: 'btn', description: '',
        propsSchema: { type: 'object', properties: {} }, variants: [],
        files: { 'index.js': v2Hash }, packageHash: '', sizeBudgetBytes: 0,
        createdAt: Date.now(), updatedAt: Date.now(),
      });

      await installPackage(deps, { workspaceId: 'ws-1', userId: 'u-1', catalogId: 'comp.btn', version: '1.0.0' });
      const updates = await checkForUpdates(deps, { userId: 'u-1', workspaceId: 'ws-1' });
      expect(updates.length).toBe(1);
      expect(updates[0]!.updateAvailable).toBe(true);
      expect(updates[0]!.latestVersion).toBe('2.0.0');
    });

    it('returns empty for no installs', async () => {
      const updates = await checkForUpdates(deps, { userId: 'u-1', workspaceId: 'ws-1' });
      expect(updates).toEqual([]);
    });
  });
});
