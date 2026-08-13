import type { ServiceDeps } from '../deps.js';
import { Errors } from '../errors.js';

// ---------------------------------------------------------------------------
// Stock photo types
// ---------------------------------------------------------------------------

export interface StockResult {
  id: string;
  url: string;
  thumbUrl: string;
  width: number;
  height: number;
  author: string;
  attributionHtml: string;
  provider: string;
}

export interface StockFetchResult {
  url: string;
  attribution: string;
  license: string;
}

export interface StockProvider {
  id: string;
  name: string;
  search(q: string, opts: { perPage?: number; page?: number }): Promise<StockResult[]>;
  fetch(photoId: string, opts: Record<string, unknown>): Promise<StockFetchResult>;
}

// ---------------------------------------------------------------------------
// Provider registry
// ---------------------------------------------------------------------------

const providers = new Map<string, StockProvider>();

export function registerStockProvider(provider: StockProvider): void {
  providers.set(provider.id, provider);
}

export function getStockProvider(id: string): StockProvider | undefined {
  return providers.get(id);
}

// ---------------------------------------------------------------------------
// Unsplash provider
// ---------------------------------------------------------------------------

interface UnsplashPhoto {
  id: string;
  urls: { raw?: string; thumb?: string; small?: string };
  user: { name: string };
  width: number;
  height: number;
}

interface UnsplashSearchResponse {
  results: UnsplashPhoto[];
}

export function unsplashProvider(opts: { apiKey: string; http?: typeof fetch }): StockProvider {
  if (!opts.apiKey) throw Errors.validation('Unsplash API key is required');
  const httpFetch = opts.http ?? globalThis.fetch;

  return {
    id: 'unsplash',
    name: 'Unsplash',

    async search(q, { perPage = 20, page = 1 } = {}): Promise<StockResult[]> {
      const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&per_page=${perPage}&page=${page}`;

      let resp: Response;
      try {
        resp = await httpFetch(url, {
          headers: {
            Authorization: `Client-ID ${opts.apiKey}`,
          },
        });
      } catch (err) {
        throw Errors.validation(
          `Unsplash request failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      if (!resp.ok) {
        throw Errors.validation(`Unsplash API returned ${resp.status}`);
      }

      const data: UnsplashSearchResponse = (await resp.json()) as UnsplashSearchResponse;

      return data.results.map((photo) => ({
        id: photo.id,
        url: photo.urls.raw ?? photo.urls.thumb ?? photo.urls.small ?? '',
        thumbUrl: photo.urls.thumb ?? photo.urls.small ?? '',
        width: photo.width,
        height: photo.height,
        author: photo.user.name,
        attributionHtml: `Photo by <a href="https://unsplash.com/@${encodeURIComponent(photo.user.name)}">${photo.user.name}</a> on <a href="https://unsplash.com">Unsplash</a>`,
        provider: 'unsplash',
      }));
    },

    async fetch(photoId, _opts): Promise<StockFetchResult> {
      const url = `https://api.unsplash.com/photos/${encodeURIComponent(photoId)}`;

      let resp: Response;
      try {
        resp = await httpFetch(url, {
          headers: {
            Authorization: `Client-ID ${opts.apiKey}`,
          },
        });
      } catch (err) {
        throw Errors.validation(
          `Unsplash request failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      if (!resp.ok) {
        throw Errors.validation(`Unsplash API returned ${resp.status}`);
      }

      const photo: UnsplashPhoto = (await resp.json()) as UnsplashPhoto;
      return {
        url: photo.urls.raw ?? '',
        attribution: `Photo by ${photo.user.name} on Unsplash`,
        license: 'Unsplash License',
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Pexels provider
// ---------------------------------------------------------------------------

interface PexelsPhoto {
  id: number;
  src: { large?: string; medium?: string; tiny?: string };
  photographer: string;
  width: number;
  height: number;
  photographer_url: string;
}

interface PexelsSearchResponse {
  photos: PexelsPhoto[];
}

export function pexelsProvider(opts: { apiKey: string; http?: typeof fetch }): StockProvider {
  if (!opts.apiKey) throw Errors.validation('Pexels API key is required');
  const httpFetch = opts.http ?? globalThis.fetch;

  return {
    id: 'pexels',
    name: 'Pexels',

    async search(q, { perPage = 20, page = 1 } = {}): Promise<StockResult[]> {
      const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=${perPage}&page=${page}`;

      let resp: Response;
      try {
        resp = await httpFetch(url, {
          headers: {
            Authorization: opts.apiKey,
          },
        });
      } catch (err) {
        throw Errors.validation(
          `Pexels request failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      if (!resp.ok) {
        throw Errors.validation(`Pexels API returned ${resp.status}`);
      }

      const data: PexelsSearchResponse = (await resp.json()) as PexelsSearchResponse;

      return data.photos.map((photo) => ({
        id: String(photo.id),
        url: photo.src.large ?? photo.src.medium ?? photo.src.tiny ?? '',
        thumbUrl: photo.src.medium ?? photo.src.tiny ?? '',
        width: photo.width,
        height: photo.height,
        author: photo.photographer,
        attributionHtml: `Photo by <a href="${photo.photographer_url}">${photo.photographer}</a> on <a href="https://pexels.com">Pexels</a>`,
        provider: 'pexels',
      }));
    },

    async fetch(photoId, _opts): Promise<StockFetchResult> {
      const url = `https://api.pexels.com/v1/photos/${encodeURIComponent(photoId)}`;

      let resp: Response;
      try {
        resp = await httpFetch(url, {
          headers: {
            Authorization: opts.apiKey,
          },
        });
      } catch (err) {
        throw Errors.validation(
          `Pexels request failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      if (!resp.ok) {
        throw Errors.validation(`Pexels API returned ${resp.status}`);
      }

      const photo: PexelsPhoto = (await resp.json()) as PexelsPhoto;
      return {
        url: photo.src.large ?? '',
        attribution: `Photo by ${photo.photographer} on Pexels`,
        license: 'Pexels License',
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Stock media cache + takedown
// ---------------------------------------------------------------------------

interface CacheEntry {
  url: string;
  fetchedAt: number;
}

export class StockMediaCache {
  private cache = new Map<string, CacheEntry>();
  private staleAfterMs: number;

  constructor(staleAfterMs = 24 * 60 * 60 * 1000) {
    this.staleAfterMs = staleAfterMs;
  }

  get(photoId: string): CacheEntry | undefined {
    return this.cache.get(photoId);
  }

  set(photoId: string, url: string): void {
    this.cache.set(photoId, { url, fetchedAt: Date.now() });
  }

  isStale(photoId: string): boolean {
    const entry = this.cache.get(photoId);
    if (!entry) return true;
    return Date.now() - entry.fetchedAt > this.staleAfterMs;
  }

  remove(photoId: string): void {
    this.cache.delete(photoId);
  }

  takedownPlaceholder(photoId: string, provider: string): StockResult {
    this.cache.delete(photoId);
    return {
      id: photoId,
      url: '',
      thumbUrl: '',
      width: 0,
      height: 0,
      author: '',
      attributionHtml: 'Removed by takedown request',
      provider,
    };
  }
}

// ---------------------------------------------------------------------------
// searchStock dispatcher
// ---------------------------------------------------------------------------

export interface SearchStockInput {
  providerId: string;
  q: string;
  perPage?: number;
  page?: number;
}

export async function searchStock(
  _deps: ServiceDeps,
  input: SearchStockInput,
): Promise<StockResult[]> {
  const provider = providers.get(input.providerId);
  if (!provider) {
    throw Errors.notFound(`stock provider ${input.providerId}`);
  }

  return provider.search(input.q, {
    ...(input.perPage != null ? { perPage: input.perPage } : {}),
    ...(input.page != null ? { page: input.page } : {}),
  });
}
