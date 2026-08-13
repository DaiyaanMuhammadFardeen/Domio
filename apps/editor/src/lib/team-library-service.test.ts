/**
 * team-library-service — Wave 2 §S2.6 unit tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isBrandLocked,
  listLibraryEntries,
  listUpdateCandidates,
  publishToLibrary,
  removeFromLibraryService,
  updateLibraryVersion,
} from './team-library-service';

const originalFetch = globalThis.fetch;

// Provide a working localStorage mock for jsdom (vitest's jsdom env
// doesn't expose localStorage on globalThis by default in 2.1.x).
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
    configurable: true,
  });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('team-library-service', () => {
  it('listLibraryEntries returns [] for team scope on bootstrap', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    const entries = await listLibraryEntries('team');
    expect(entries).toEqual([]);
  });

  it('listLibraryEntries returns the remote payload when reachable', async () => {
    const remote = [
      {
        catalogId: 'c-1',
        name: 'Foo',
        version: '1.0.0',
        scope: 'team',
        brandLocked: true,
        publishedAtMs: 0,
      },
    ];
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => remote,
    }) as unknown as typeof fetch;
    const entries = await listLibraryEntries('team');
    expect(entries).toEqual(remote);
  });

  it('listLibraryEntries falls back to localStorage entries for personal scope', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    localStorage.setItem(
      'domio.my-library',
      JSON.stringify([
        {
          catalogId: 'c-1',
          name: 'Foo',
          version: '1.0.0',
          pinMode: 'track',
          pinValue: '',
          addedAt: 1000,
        },
      ]),
    );
    const entries = await listLibraryEntries('personal');
    expect(entries.length).toBe(1);
    expect(entries[0]?.catalogId).toBe('c-1');
    expect(entries[0]?.scope).toBe('personal');
  });

  it('listLibraryEntries respects the brand-lock list when mapping local entries', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    localStorage.setItem(
      'domio.my-library',
      JSON.stringify([
        {
          catalogId: 'c-locked',
          name: 'Locked',
          version: '1.0.0',
          pinMode: 'track',
          pinValue: '',
          addedAt: 0,
        },
      ]),
    );
    localStorage.setItem('domio.brand-lock', JSON.stringify(['c-locked']));
    const entries = await listLibraryEntries('personal');
    expect(entries[0]?.brandLocked).toBe(true);
  });

  it('listUpdateCandidates returns an empty map on bootstrap', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    const map = await listUpdateCandidates();
    expect(map.size).toBe(0);
  });

  it('listUpdateCandidates parses the remote payload when reachable', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ catalogId: 'c-1', latest: '2.0.0' }],
    }) as unknown as typeof fetch;
    const map = await listUpdateCandidates();
    expect(map.get('c-1')).toBe('2.0.0');
  });

  it('publishToLibrary hits the remote when reachable and returns the response', async () => {
    const remote = { catalogId: 'c-1', version: '1.0.0', publishedAtMs: 1234 };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => remote,
    }) as unknown as typeof fetch;
    const out = await publishToLibrary({
      catalogId: 'c-1',
      name: 'Foo',
      version: '1.0.0',
      scope: 'personal',
    });
    expect(out).toEqual(remote);
  });

  it('publishToLibrary falls back to localStorage when offline', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    const out = await publishToLibrary({
      catalogId: 'c-offline',
      name: 'Offline',
      version: '1.0.0',
      scope: 'personal',
    });
    expect(out.catalogId).toBe('c-offline');
    const raw = localStorage.getItem('domio.my-library') ?? '[]';
    const arr = JSON.parse(raw) as Array<{ catalogId: string }>;
    expect(arr.some((i) => i.catalogId === 'c-offline')).toBe(true);
  });

  it('publishToLibrary records the brand-lock flag in the bootstrap fallback', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    await publishToLibrary({
      catalogId: 'c-locked-offline',
      name: 'Locked Offline',
      version: '1.0.0',
      scope: 'team',
      brandLocked: true,
    });
    const raw = localStorage.getItem('domio.brand-lock') ?? '[]';
    const arr = JSON.parse(raw) as string[];
    expect(arr).toContain('c-locked-offline');
  });

  it('updateLibraryVersion bumps the local entry', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    }) as unknown as typeof fetch;
    localStorage.setItem(
      'domio.my-library',
      JSON.stringify([
        {
          catalogId: 'c-bump',
          name: 'Foo',
          version: '1.0.0',
          pinMode: 'track',
          pinValue: '',
          addedAt: 0,
        },
      ]),
    );
    await updateLibraryVersion('c-bump', '2.0.0');
    const raw = localStorage.getItem('domio.my-library') ?? '[]';
    const arr = JSON.parse(raw) as Array<{ catalogId: string; version: string }>;
    expect(arr.find((i) => i.catalogId === 'c-bump')?.version).toBe('2.0.0');
  });

  it('removeFromLibraryService drops the local entry', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    }) as unknown as typeof fetch;
    localStorage.setItem(
      'domio.my-library',
      JSON.stringify([
        {
          catalogId: 'c-rm',
          name: 'Foo',
          version: '1.0.0',
          pinMode: 'track',
          pinValue: '',
          addedAt: 0,
        },
      ]),
    );
    await removeFromLibraryService('c-rm');
    const raw = localStorage.getItem('domio.my-library') ?? '[]';
    const arr = JSON.parse(raw) as Array<{ catalogId: string }>;
    expect(arr.find((i) => i.catalogId === 'c-rm')).toBeUndefined();
  });

  it('isBrandLocked returns true when the entry is brand-locked', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        catalogId: 'c-lk',
        name: 'X',
        version: '1',
        scope: 'team',
        brandLocked: true,
        publishedAtMs: 0,
      }),
    }) as unknown as typeof fetch;
    const out = await isBrandLocked('c-lk');
    expect(out).toBe(true);
  });

  it('isBrandLocked returns false when not found', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    const out = await isBrandLocked('nope');
    expect(out).toBe(false);
  });
});
