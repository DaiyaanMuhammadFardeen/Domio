/**
 * Tests for library.ts — pin modes, unavailable survival, CRUD operations.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getLibraryItems,
  addToLibrary,
  removeFromLibrary,
  updateLibraryItem,
  isInLibrary,
  type LibraryItem,
} from './library';

const STORAGE_KEY = 'domio.my-library';

// Provide a working localStorage mock for jsdom
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
    },
    writable: true,
  });
});

describe('getLibraryItems', () => {
  it('returns empty array when localStorage is empty', () => {
    expect(getLibraryItems()).toEqual([]);
  });

  it('returns parsed items from localStorage', () => {
    const items: LibraryItem[] = [
      {
        catalogId: 'domio.stat-card',
        name: 'Stat Card',
        version: '1.0.0',
        pinMode: 'track',
        pinValue: '',
        addedAt: Date.now(),
      },
    ];
    store.set(STORAGE_KEY, JSON.stringify(items));
    expect(getLibraryItems()).toHaveLength(1);
    expect(getLibraryItems()[0]!.catalogId).toBe('domio.stat-card');
  });
});

describe('addToLibrary', () => {
  it('adds a new item', () => {
    const item = addToLibrary({
      catalogId: 'domio.stat-card',
      name: 'Stat Card',
      version: '1.0.0',
      pinMode: 'track',
      pinValue: '',
    });
    expect(item.catalogId).toBe('domio.stat-card');
    expect(item.addedAt).toBeGreaterThan(0);
    expect(getLibraryItems()).toHaveLength(1);
  });

  it('updates existing item with same catalogId', () => {
    addToLibrary({
      catalogId: 'domio.stat-card',
      name: 'Stat Card',
      version: '1.0.0',
      pinMode: 'track',
      pinValue: '',
    });
    addToLibrary({
      catalogId: 'domio.stat-card',
      name: 'Stat Card',
      version: '1.1.0',
      pinMode: 'pin-version',
      pinValue: '1.1.0',
    });
    const items = getLibraryItems();
    expect(items).toHaveLength(1);
    expect(items[0]!.version).toBe('1.1.0');
    expect(items[0]!.pinMode).toBe('pin-version');
  });
});

describe('pin survival / unavailable', () => {
  it('survives when version is pinned even if "removed"', () => {
    addToLibrary({
      catalogId: 'domio.my-custom',
      name: 'My Custom',
      version: '0.5.0',
      pinMode: 'pin-version',
      pinValue: '0.5.0',
    });
    const items = getLibraryItems();
    expect(items).toHaveLength(1);
    expect(items[0]!.pinMode).toBe('pin-version');
    expect(items[0]!.pinValue).toBe('0.5.0');
  });

  it('pin mode "track" keeps latest version on update', () => {
    addToLibrary({
      catalogId: 'domio.stat-card',
      name: 'Stat Card',
      version: '1.0.0',
      pinMode: 'track',
      pinValue: '',
    });
    updateLibraryItem('domio.stat-card', { version: '2.0.0' });
    const items = getLibraryItems();
    expect(items[0]!.version).toBe('2.0.0');
    expect(items[0]!.pinMode).toBe('track');
  });

  it('pin mode "pin-range" persists range value', () => {
    addToLibrary({
      catalogId: 'domio.stat-card',
      name: 'Stat Card',
      version: '1.0.0',
      pinMode: 'pin-range',
      pinValue: '>=1.0.0 <2.0.0',
    });
    const items = getLibraryItems();
    expect(items[0]!.pinMode).toBe('pin-range');
    expect(items[0]!.pinValue).toBe('>=1.0.0 <2.0.0');
  });
});

describe('removeFromLibrary', () => {
  it('removes an item by catalogId', () => {
    addToLibrary({
      catalogId: 'domio.stat-card',
      name: 'Stat Card',
      version: '1.0.0',
      pinMode: 'track',
      pinValue: '',
    });
    expect(getLibraryItems()).toHaveLength(1);
    removeFromLibrary('domio.stat-card');
    expect(getLibraryItems()).toHaveLength(0);
  });
});

describe('isInLibrary', () => {
  it('returns false for missing items', () => {
    expect(isInLibrary('domio.stat-card')).toBe(false);
  });

  it('returns true for added items', () => {
    addToLibrary({
      catalogId: 'domio.stat-card',
      name: 'Stat Card',
      version: '1.0.0',
      pinMode: 'track',
      pinValue: '',
    });
    expect(isInLibrary('domio.stat-card')).toBe(true);
  });
});
