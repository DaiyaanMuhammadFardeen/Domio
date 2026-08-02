import type { ServiceDeps } from '../deps.js';
import type { MarketplaceListing } from '../store/types.js';
import { listingReviewStats } from './reviews.js';

export interface SearchIndexEntry {
  listingId: string;
  tokens: Set<string>;
}

export interface SearchIndex {
  byId: Map<string, MarketplaceListing>;
  tokens: Map<string, Set<string>>; // token → set of listingIds
}

/** In-memory search index (lives for the lifetime of the process). */
const index: SearchIndex = {
  byId: new Map(),
  tokens: new Map(),
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);
}

function addTokens(listingId: string, texts: string[]): void {
  for (const text of texts) {
    for (const token of tokenize(text)) {
      let ids = index.tokens.get(token);
      if (!ids) {
        ids = new Set();
        index.tokens.set(token, ids);
      }
      ids.add(listingId);
    }
  }
}

function removeTokens(listingId: string): void {
  for (const [token, ids] of index.tokens) {
    ids.delete(listingId);
    if (ids.size === 0) index.tokens.delete(token);
  }
}

/** Index or re-index a single listing. */
export async function indexListing(deps: ServiceDeps, listingId: string): Promise<void> {
  const listing = await deps.store.getListing(listingId);
  if (!listing) return;
  // Remove old tokens if re-indexing
  removeTokens(listingId);
  index.byId.set(listingId, listing);
  addTokens(listingId, [listing.title, listing.description, ...listing.tags]);
}

/** Rebuild the entire index from the store. */
export async function reindexAll(deps: ServiceDeps): Promise<void> {
  index.byId.clear();
  index.tokens.clear();
  const listings = await deps.store.listListings();
  for (const listing of listings) {
    index.byId.set(listing.id, listing);
    addTokens(listing.id, [listing.title, listing.description, ...listing.tags]);
  }
}

export type SortMode = 'relevance' | 'newest' | 'price-asc' | 'price-desc' | 'rating';

export interface SearchParams {
  q?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: SortMode;
  page?: number;
  pageSize?: number;
}

export interface SearchResult {
  items: MarketplaceListing[];
  total: number;
  page: number;
  pageSize: number;
}

/** Search the in-memory index. Returns only non-removed published listings. */
export async function searchListings(
  deps: ServiceDeps,
  params: SearchParams = {},
): Promise<SearchResult> {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 20;

  // Start with all indexed listings
  let candidates: MarketplaceListing[] = [];

  if (params.q && params.q.trim().length > 0) {
    // Token-based intersection: find listingIds that match all query tokens
    const qTokens = tokenize(params.q);
    if (qTokens.length === 0) {
      // empty query matches nothing
    } else {
      let matchingIds: Set<string> | null = null;
      for (const qt of qTokens) {
        const hits = new Set<string>();
        for (const [token, ids] of index.tokens) {
          if (token.includes(qt)) {
            for (const id of ids) hits.add(id);
          }
        }
        if (matchingIds === null) {
          matchingIds = hits;
        } else {
          const filtered: string[] = [];
          for (const id of matchingIds) {
            if (hits.has(id)) filtered.push(id);
          }
          matchingIds = new Set(filtered);
        }
      }
      if (matchingIds) {
        for (const id of matchingIds) {
          const listing = index.byId.get(id);
          if (listing) candidates.push(listing);
        }
      }
    }
  } else {
    // No query — all listings
    for (const listing of index.byId.values()) {
      candidates.push(listing);
    }
  }

  // Exclude removed listings
  candidates = candidates.filter((l) => l.status !== 'removed');

  // Filter by category (tag)
  if (params.category) {
    candidates = candidates.filter((l) => l.tags.includes(params.category!));
  }

  // Filter by price range
  if (params.minPrice !== undefined) {
    candidates = candidates.filter((l) => {
      if (l.isFree) return params.minPrice! <= 0;
      return (l.priceCents ?? 0) >= params.minPrice!;
    });
  }
  if (params.maxPrice !== undefined) {
    candidates = candidates.filter((l) => {
      if (l.isFree) return params.maxPrice! >= 0;
      return (l.priceCents ?? 0) <= params.maxPrice!;
    });
  }

  const total = candidates.length;

  // Sort
  const sort = params.sort ?? 'relevance';
  if (sort === 'newest') {
    candidates.sort((a, b) => (b.publishedAt ?? b.createdAt) - (a.publishedAt ?? a.createdAt));
  } else if (sort === 'price-asc') {
    candidates.sort((a, b) => (a.priceCents ?? 0) - (b.priceCents ?? 0));
  } else if (sort === 'price-desc') {
    candidates.sort((a, b) => (b.priceCents ?? 0) - (a.priceCents ?? 0));
  } else if (sort === 'rating') {
    // Sort by rating descending (cached from index; we batch-fetch stats)
    const statsCache = new Map<string, number>();
    const withRating = await Promise.all(
      candidates.map(async (l) => {
        const stats = await listingReviewStats(deps, l.id);
        statsCache.set(l.id, stats.rating);
        return l;
      }),
    );
    withRating.sort((a, b) => (statsCache.get(b.id) ?? 0) - (statsCache.get(a.id) ?? 0));
    candidates = withRating;
  }
  // 'relevance' keeps the default ordering (query-scored or insertion order)

  // Paginate
  const start = (page - 1) * pageSize;
  const items = candidates.slice(start, start + pageSize);

  return { items, total, page, pageSize };
}

/** Return all distinct tags across published (non-removed) listings. */
export async function listCategories(deps: ServiceDeps): Promise<string[]> {
  const listings = await deps.store.listListings();
  const tags = new Set<string>();
  for (const l of listings) {
    if (l.status !== 'removed') {
      for (const t of l.tags) tags.add(t);
    }
  }
  return [...tags].sort();
}
