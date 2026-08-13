import { describe, it, expect, vi } from 'vitest';
import { InMemoryStore } from '../store/memory.js';
import { defaultDeps, type ServiceDeps } from '../deps.js';
import {
  unsplashProvider,
  pexelsProvider,
  registerStockProvider,
  searchStock,
  StockMediaCache,
} from './stock.js';

function makeDeps(overrides: Partial<ServiceDeps> = {}): ServiceDeps {
  return defaultDeps(new InMemoryStore(), overrides);
}

function makeMockFetch(responseBody: unknown, status = 200): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => responseBody,
  } as Response);
}

describe('stock', () => {
  describe('unsplashProvider', () => {
    it('throws if apiKey is missing', () => {
      expect(() => unsplashProvider({ apiKey: '' })).toThrow('Unsplash API key is required');
    });

    it('search sends correct URL and params', async () => {
      const mockResponse = {
        results: [
          {
            id: 'photo-1',
            urls: {
              raw: 'https://images.unsplash.com/photo-1?raw',
              thumb: 'https://images.unsplash.com/photo-1?thumb',
              small: 'https://images.unsplash.com/photo-1?small',
            },
            user: { name: 'Alice' },
            width: 1920,
            height: 1080,
          },
        ],
      };
      const http = makeMockFetch(mockResponse);
      const provider = unsplashProvider({ apiKey: 'test-key', http });

      const results = await provider.search('nature', { perPage: 10, page: 2 });

      expect(http).toHaveBeenCalledTimes(1);
      const calledUrl = (http as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
      expect(calledUrl).toContain('api.unsplash.com/search/photos');
      expect(calledUrl).toContain('query=nature');
      expect(calledUrl).toContain('per_page=10');
      expect(calledUrl).toContain('page=2');

      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe('photo-1');
      expect(results[0]!.author).toBe('Alice');
      expect(results[0]!.provider).toBe('unsplash');
      expect(results[0]!.attributionHtml).toContain('Unsplash');
    });

    it('maps perPage correctly (default 20)', async () => {
      const http = makeMockFetch({ results: [] });
      const provider = unsplashProvider({ apiKey: 'test-key', http });
      await provider.search('city', {});
      const calledUrl = (http as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
      expect(calledUrl).toContain('per_page=20');
    });

    it('throws on HTTP failure', async () => {
      const http = makeMockFetch({ error: 'unauthorized' }, 401);
      const provider = unsplashProvider({ apiKey: 'bad-key', http });
      await expect(provider.search('test', {})).rejects.toThrow('Unsplash API returned 401');
    });

    it('throws on network error', async () => {
      const http = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      const provider = unsplashProvider({ apiKey: 'test', http });
      await expect(provider.search('test', {})).rejects.toThrow('Unsplash request failed');
    });

    it('fetch retrieves a single photo', async () => {
      const mockPhoto = {
        id: 'photo-42',
        urls: {
          raw: 'https://images.unsplash.com/photo-42?raw',
          thumb: 'https://images.unsplash.com/photo-42?thumb',
        },
        user: { name: 'Carol' },
        width: 800,
        height: 600,
      };
      const http = makeMockFetch(mockPhoto);
      const provider = unsplashProvider({ apiKey: 'key', http });
      const result = await provider.fetch('photo-42', {});
      expect(result.url).toContain('photo-42');
      expect(result.attribution).toContain('Carol');
      expect(result.license).toBe('Unsplash License');
    });

    it('fetch throws on HTTP failure', async () => {
      const http = makeMockFetch({}, 404);
      const provider = unsplashProvider({ apiKey: 'key', http });
      await expect(provider.fetch('missing', {})).rejects.toThrow('404');
    });

    it('fetch throws on network error', async () => {
      const http = vi.fn().mockRejectedValue(new Error('timeout'));
      const provider = unsplashProvider({ apiKey: 'key', http });
      await expect(provider.fetch('x', {})).rejects.toThrow('request failed');
    });

    it('search fallbacks for missing URLs', async () => {
      const mockResponse = {
        results: [
          {
            id: 'p1',
            urls: { thumb: 'https://thumb' },
            user: { name: 'X' },
            width: 100,
            height: 100,
          },
        ],
      };
      const http = makeMockFetch(mockResponse);
      const provider = unsplashProvider({ apiKey: 'k', http });
      const results = await provider.search('q', {});
      expect(results[0]!.url).toBe('https://thumb');
    });
  });

  describe('pexelsProvider', () => {
    it('throws if apiKey is missing', () => {
      expect(() => pexelsProvider({ apiKey: '' })).toThrow('Pexels API key is required');
    });

    it('search sends correct URL and params', async () => {
      const mockResponse = {
        photos: [
          {
            id: 12345,
            src: {
              large: 'https://images.pexels.com/12345/large.jpg',
              medium: 'https://images.pexels.com/12345/medium.jpg',
              tiny: 'https://images.pexels.com/12345/tiny.jpg',
            },
            photographer: 'Bob',
            width: 4000,
            height: 3000,
            photographer_url: 'https://pexels.com/bob',
          },
        ],
      };
      const http = makeMockFetch(mockResponse);
      const provider = pexelsProvider({ apiKey: 'pexels-key', http });

      const results = await provider.search('cats', { perPage: 5, page: 3 });

      expect(http).toHaveBeenCalledTimes(1);
      const calledUrl = (http as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
      expect(calledUrl).toContain('api.pexels.com/v1/search');
      expect(calledUrl).toContain('query=cats');
      expect(calledUrl).toContain('per_page=5');
      expect(calledUrl).toContain('page=3');

      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe('12345');
      expect(results[0]!.author).toBe('Bob');
      expect(results[0]!.provider).toBe('pexels');
      expect(results[0]!.url).toBe('https://images.pexels.com/12345/large.jpg');
      expect(results[0]!.thumbUrl).toBe('https://images.pexels.com/12345/medium.jpg');
      expect(results[0]!.attributionHtml).toContain('Pexels');
    });

    it('throws on HTTP failure', async () => {
      const http = makeMockFetch({ error: 'forbidden' }, 403);
      const provider = pexelsProvider({ apiKey: 'bad', http });
      await expect(provider.search('test', {})).rejects.toThrow('Pexels API returned 403');
    });

    it('throws on network error', async () => {
      const http = vi.fn().mockRejectedValue(new Error('timeout'));
      const provider = pexelsProvider({ apiKey: 'key', http });
      await expect(provider.search('test', {})).rejects.toThrow('Pexels request failed');
    });

    it('fetch retrieves a single photo', async () => {
      const mockPhoto = {
        id: 99,
        src: { large: 'https://large.jpg' },
        photographer: 'Dan',
        width: 1024,
        height: 768,
        photographer_url: 'https://pexels.com/dan',
      };
      const http = makeMockFetch(mockPhoto);
      const provider = pexelsProvider({ apiKey: 'key', http });
      const result = await provider.fetch('99', {});
      expect(result.url).toBe('https://large.jpg');
      expect(result.attribution).toContain('Dan');
      expect(result.license).toBe('Pexels License');
    });

    it('fetch throws on HTTP failure', async () => {
      const http = makeMockFetch({}, 500);
      const provider = pexelsProvider({ apiKey: 'key', http });
      await expect(provider.fetch('99', {})).rejects.toThrow('500');
    });

    it('fetch throws on network error', async () => {
      const http = vi.fn().mockRejectedValue(new Error('net'));
      const provider = pexelsProvider({ apiKey: 'key', http });
      await expect(provider.fetch('99', {})).rejects.toThrow('request failed');
    });

    it('search fallbacks for missing URLs', async () => {
      const mockResponse = {
        photos: [
          {
            id: 1,
            src: { tiny: 'https://tiny.jpg' },
            photographer: 'Eve',
            width: 50,
            height: 50,
            photographer_url: 'https://pexels.com/eve',
          },
        ],
      };
      const http = makeMockFetch(mockResponse);
      const provider = pexelsProvider({ apiKey: 'k', http });
      const results = await provider.search('q', {});
      expect(results[0]!.url).toBe('https://tiny.jpg');
      expect(results[0]!.thumbUrl).toBe('https://tiny.jpg');
    });
  });

  describe('searchStock', () => {
    it('dispatches to registered provider', async () => {
      const mockProvider = {
        id: 'mock',
        name: 'Mock',
        search: vi.fn().mockResolvedValue([]),
        fetch: vi.fn(),
      };
      registerStockProvider(mockProvider);

      const deps = makeDeps();
      await searchStock(deps, { providerId: 'mock', q: 'dogs', perPage: 10 });

      expect(mockProvider.search).toHaveBeenCalledWith('dogs', {
        perPage: 10,
      });
    });

    it('throws for unknown provider', async () => {
      const deps = makeDeps();
      await expect(searchStock(deps, { providerId: 'nonexistent', q: 'test' })).rejects.toThrow(
        'not found',
      );
    });
  });

  describe('StockMediaCache', () => {
    it('stores and retrieves entries', () => {
      const cache = new StockMediaCache();
      cache.set('photo-1', 'https://example.com/photo-1.jpg');
      const entry = cache.get('photo-1');
      expect(entry).toBeDefined();
      expect(entry!.url).toBe('https://example.com/photo-1.jpg');
    });

    it('marks fresh entries as not stale', () => {
      const cache = new StockMediaCache(24 * 60 * 60 * 1000);
      cache.set('photo-1', 'https://example.com/photo-1.jpg');
      expect(cache.isStale('photo-1')).toBe(false);
    });

    it('marks missing entries as stale', () => {
      const cache = new StockMediaCache();
      expect(cache.isStale('nonexistent')).toBe(true);
    });

    it('marks old entries as stale', () => {
      const cache = new StockMediaCache(1000); // 1 second TTL
      cache.set('photo-1', 'https://example.com/photo-1.jpg');
      // Entry is fresh immediately
      expect(cache.isStale('photo-1')).toBe(false);
      // Manually age the entry
      const entry = cache.get('photo-1')!;
      entry.fetchedAt = Date.now() - 2000;
      expect(cache.isStale('photo-1')).toBe(true);
    });

    it('takedownPlaceholder removes from cache and returns placeholder', () => {
      const cache = new StockMediaCache();
      cache.set('photo-1', 'https://example.com/photo-1.jpg');
      const result = cache.takedownPlaceholder('photo-1', 'unsplash');

      expect(cache.get('photo-1')).toBeUndefined();
      expect(result.id).toBe('photo-1');
      expect(result.url).toBe('');
      expect(result.attributionHtml).toBe('Removed by takedown request');
      expect(result.provider).toBe('unsplash');
    });

    it('remove deletes entry', () => {
      const cache = new StockMediaCache();
      cache.set('photo-1', 'https://example.com/photo-1.jpg');
      cache.remove('photo-1');
      expect(cache.get('photo-1')).toBeUndefined();
    });
  });
});
