import { describe, it, expect } from 'vitest';
import { InMemoryStore } from '../store/memory.js';
import { defaultDeps, type ServiceDeps } from '../deps.js';
import type { StickerPack } from '../store/types.js';
import { installStickerPack, listAvailableStickerPacks } from './stickers.js';

function makeDeps(overrides: Partial<ServiceDeps> = {}): ServiceDeps {
  return defaultDeps(new InMemoryStore(), overrides);
}

async function seedPack(deps: ServiceDeps, pack: StickerPack): Promise<void> {
  await deps.store.putStickerPack(pack);
}

describe('stickers', () => {
  describe('installStickerPack', () => {
    it('returns per-sticker records with informalOnly', async () => {
      const deps = makeDeps();
      await seedPack(deps, {
        id: 'pack-1',
        name: 'Emoji Pack',
        theme: 'fun',
        informalOnly: true,
        stickerComponentIds: ['sticker-a', 'sticker-b', 'sticker-c'],
        createdAt: Date.now(),
      });

      const result = await installStickerPack(deps, {
        packId: 'pack-1',
        workspaceId: 'ws-1',
        userId: 'user-1',
      });

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        catalogId: 'sticker-a',
        informalOnly: true,
        installed: true,
      });
      expect(result[1]).toEqual({
        catalogId: 'sticker-b',
        informalOnly: true,
        installed: true,
      });
      expect(result[2]).toEqual({
        catalogId: 'sticker-c',
        informalOnly: true,
        installed: true,
      });
    });

    it('uses pack informalOnly value', async () => {
      const deps = makeDeps();
      await seedPack(deps, {
        id: 'pack-formal',
        name: 'Formal Pack',
        theme: 'business',
        informalOnly: false,
        stickerComponentIds: ['formal-sticker'],
        createdAt: Date.now(),
      });

      const result = await installStickerPack(deps, {
        packId: 'pack-formal',
        workspaceId: 'ws-1',
        userId: 'user-1',
      });

      expect(result[0]!.informalOnly).toBe(false);
    });

    it('throws ERR_NOT_FOUND for missing pack', async () => {
      const deps = makeDeps();
      await expect(
        installStickerPack(deps, {
          packId: 'nonexistent',
          workspaceId: 'ws-1',
          userId: 'user-1',
        }),
      ).rejects.toThrow('not found');
    });

    it('returns empty array for pack with no stickers', async () => {
      const deps = makeDeps();
      await seedPack(deps, {
        id: 'pack-empty',
        name: 'Empty Pack',
        theme: 'misc',
        informalOnly: false,
        stickerComponentIds: [],
        createdAt: Date.now(),
      });

      const result = await installStickerPack(deps, {
        packId: 'pack-empty',
        workspaceId: 'ws-1',
        userId: 'user-1',
      });

      expect(result).toHaveLength(0);
    });
  });

  describe('listAvailableStickerPacks', () => {
    it('returns all packs when no theme filter', async () => {
      const deps = makeDeps();
      await seedPack(deps, {
        id: 'pack-1',
        name: 'A',
        theme: 'fun',
        informalOnly: false,
        stickerComponentIds: ['s1'],
        createdAt: Date.now(),
      });
      await seedPack(deps, {
        id: 'pack-2',
        name: 'B',
        theme: 'business',
        informalOnly: true,
        stickerComponentIds: ['s2'],
        createdAt: Date.now(),
      });

      const result = await listAvailableStickerPacks(deps);
      expect(result.length).toBeGreaterThanOrEqual(2);
    });

    it('filters by theme', async () => {
      const deps = makeDeps();
      await seedPack(deps, {
        id: 'pack-fun',
        name: 'Fun',
        theme: 'fun',
        informalOnly: false,
        stickerComponentIds: ['s1'],
        createdAt: Date.now(),
      });
      await seedPack(deps, {
        id: 'pack-biz',
        name: 'Biz',
        theme: 'business',
        informalOnly: false,
        stickerComponentIds: ['s2'],
        createdAt: Date.now(),
      });

      const result = await listAvailableStickerPacks(deps, { theme: 'fun' });
      expect(result.length).toBe(1);
      expect(result[0]!.id).toBe('pack-fun');
    });

    it('returns empty for non-matching theme', async () => {
      const deps = makeDeps();
      await seedPack(deps, {
        id: 'pack-1',
        name: 'A',
        theme: 'fun',
        informalOnly: false,
        stickerComponentIds: ['s1'],
        createdAt: Date.now(),
      });

      const result = await listAvailableStickerPacks(deps, { theme: 'nope' });
      expect(result).toHaveLength(0);
    });
  });
});
