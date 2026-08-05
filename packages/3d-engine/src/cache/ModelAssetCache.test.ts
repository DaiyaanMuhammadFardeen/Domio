import { describe, it, expect } from 'vitest';
import { ModelAssetCache } from './ModelAssetCache.js';
import type { LoadedModel } from '../contracts/renderer.v1.js';

function makeModel(id: string): LoadedModel {
  return {
    assetId: id,
    nodes: [],
    meshes: [],
    materials: {},
    animations: [],
    boundingRadius: 1,
  };
}

describe('ModelAssetCache', () => {
  it('miss → load → hit', async () => {
    let loadCount = 0;
    const cache = new ModelAssetCache({
      loader: async (url: string) => {
        loadCount++;
        return makeModel(`model_from_${url}`);
      },
    });

    expect(cache.has('m1', 'cdn.example.com/m1.glb')).toBe(false);
    const entry = await cache.load('m1', 'cdn.example.com/m1.glb');
    expect(entry.model.assetId).toBe('model_from_cdn.example.com/m1.glb');
    expect(loadCount).toBe(1);

    // Second load should be a cache hit
    const entry2 = await cache.load('m1', 'cdn.example.com/m1.glb');
    expect(entry2.model.assetId).toBe(entry.model.assetId);
    expect(loadCount).toBe(1); // No additional load
    expect(cache.has('m1', 'cdn.example.com/m1.glb')).toBe(true);
  });

  it('same id + url reuses cached instance', async () => {
    let loadCount = 0;
    const cache = new ModelAssetCache({
      loader: async () => {
        loadCount++;
        return makeModel(`model_${loadCount}`);
      },
    });

    await cache.load('a', 'url1');
    await cache.load('a', 'url1');
    await cache.load('a', 'url1');
    expect(loadCount).toBe(1);
  });

  it('different ids are cached separately', async () => {
    const cache = new ModelAssetCache({
      loader: async (url) => makeModel(url),
    });

    await cache.load('a', 'url_a');
    await cache.load('b', 'url_b');
    expect(cache.size).toBe(2);
    expect(cache.has('a', 'url_a')).toBe(true);
    expect(cache.has('b', 'url_b')).toBe(true);
  });

  it('LRU eviction order', async () => {
    let time = 0;
    const cache = new ModelAssetCache({
      capacity: 3,
      loader: async (url) => makeModel(url),
      clock: () => time++,
    });

    await cache.load('a', 'url_a');
    await cache.load('b', 'url_b');
    await cache.load('c', 'url_c');
    expect(cache.size).toBe(3);

    // Access 'a' to make it recently used
    await cache.load('a', 'url_a');

    // Adding a 4th should evict 'b' (oldest unused)
    await cache.load('d', 'url_d');
    expect(cache.size).toBe(3);
    expect(cache.has('a', 'url_a')).toBe(true);
    expect(cache.has('b', 'url_b')).toBe(false); // evicted
    expect(cache.has('c', 'url_c')).toBe(true);
    expect(cache.has('d', 'url_d')).toBe(true);
  });

  it('clear removes all entries', async () => {
    const cache = new ModelAssetCache({
      loader: async (url) => makeModel(url),
    });
    await cache.load('a', 'url_a');
    await cache.load('b', 'url_b');
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it('delete removes specific entry', async () => {
    const cache = new ModelAssetCache({
      loader: async (url) => makeModel(url),
    });
    await cache.load('a', 'url_a');
    expect(cache.delete('a', 'url_a')).toBe(true);
    expect(cache.has('a', 'url_a')).toBe(false);
  });

  it('keys returns cached keys', async () => {
    const cache = new ModelAssetCache({
      loader: async (url) => makeModel(url),
    });
    await cache.load('a', 'url_a');
    await cache.load('b', 'url_b');
    const keys = cache.keys();
    expect(keys.length).toBe(2);
    expect(keys).toContain('a::url_a');
    expect(keys).toContain('b::url_b');
  });

  it('get returns undefined on miss', () => {
    const cache = new ModelAssetCache();
    expect(cache.get('nonexistent', 'url')).toBeUndefined();
  });
});
