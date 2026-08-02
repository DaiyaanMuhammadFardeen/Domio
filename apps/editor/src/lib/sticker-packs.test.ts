/**
 * Tests for sticker-packs.ts — pack listing and sticker lookup.
 */

import { describe, it, expect } from 'vitest';
import { getStickerPacks, findStickerByCatalogId, STICKER_PACKS } from './sticker-packs';

describe('getStickerPacks', () => {
  it('returns all packs', () => {
    const packs = getStickerPacks();
    expect(packs.length).toBeGreaterThanOrEqual(3);
  });

  it('each pack has an id and name', () => {
    for (const pack of getStickerPacks()) {
      expect(pack.id).toBeTruthy();
      expect(pack.name).toBeTruthy();
      expect(pack.stickers.length).toBeGreaterThan(0);
    }
  });

  it('marks informal packs', () => {
    const emoji = STICKER_PACKS.find((p) => p.id === 'emoji');
    expect(emoji?.informal).toBe(true);
  });
});

describe('findStickerByCatalogId', () => {
  it('finds a sticker by its catalogId', () => {
    const result = findStickerByCatalogId('domio.callout');
    expect(result).toBeDefined();
    expect(result?.sticker.catalogId).toBe('domio.callout');
    expect(result?.pack.name).toBeTruthy();
  });

  it('returns undefined for unknown catalogId', () => {
    expect(findStickerByCatalogId('domio.nonexistent')).toBeUndefined();
  });
});

describe('sticker insert payload', () => {
  it('each sticker references a valid domio.* catalogId', () => {
    for (const pack of getStickerPacks()) {
      for (const sticker of pack.stickers) {
        expect(sticker.catalogId).toMatch(/^domio\./);
        expect(sticker.label).toBeTruthy();
      }
    }
  });
});
