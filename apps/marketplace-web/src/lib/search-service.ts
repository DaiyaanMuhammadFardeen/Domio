/**
 * Marketplace search service — Wave 9 S9.1.
 *
 * Provides deterministic seeded data for the storefront search and home page
 * sections (featured, top-rated, recently-added, by-category).
 *
 * In production this would call `GET /v1/marketplace/search`; the storefront
 * currently runs without a backing marketplace-service, so the data is
 * generated locally to keep the demo end-to-end.
 */

import type {
  ListingCardVM,
  ListingKind,
  MarketplaceListing,
  MarketplaceListingWithMeta,
  SearchFacets,
  SearchQuery,
  SearchResult,
} from './types';

/* ── Seed data ──────────────────────────────────────────────────────── */

const CURRENCY = 'USD';

const KINDS: readonly ListingKind[] = [
  'component',
  'template',
  'theme',
  'sticker_pack',
  'icon_pack',
];

const THEMES: readonly string[] = [
  'dark',
  'light',
  'marketing',
  'ecommerce',
  'portfolio',
  'developer',
];

const COLORS: readonly string[] = [
  'blue',
  'purple',
  'green',
  'red',
  'amber',
  'neutral',
];

const LANGUAGES: readonly string[] = ['en', 'bn', 'es', 'fr', 'de', 'ja', 'zh-CN'];

const CREATORS: readonly string[] = [
  'Aarav Studios',
  'Nadia Labs',
  'Pixel Forge',
  'Hira Creations',
  'Domio Team',
  'Indigo Works',
];

const TITLE_PREFIXES: readonly string[] = [
  'Modern',
  'Minimal',
  'Bold',
  'Elegant',
  'Vibrant',
  'Sleek',
  'Dynamic',
  'Atlas',
  'Nova',
  'Pulse',
];

const TITLE_NOUNS: readonly string[] = [
  'Kit',
  'Pack',
  'Suite',
  'Bundle',
  'Pro',
  'Studio',
  'Essentials',
  'Foundation',
  'Collection',
  'Set',
];

/** Deterministic PRNG (mulberry32) — keeps seeded data stable across runs. */
function makePrng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = makePrng(0x9e3779b1);

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)] as T;
}

function makeId(idx: number): string {
  return `lst_${(idx + 1).toString().padStart(4, '0')}`;
}

function makeSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function buildListing(idx: number): MarketplaceListingWithMeta {
  const prefix = pick(TITLE_PREFIXES);
  const noun = pick(TITLE_NOUNS);
  const kind = pick(KINDS);
  const theme = pick(THEMES);
  const color = pick(COLORS);
  const language = pick(LANGUAGES);
  const creator = pick(CREATORS);
  const isFree = idx % 5 === 0;
  const priceCents = isFree ? 0 : 500 + Math.floor(rand() * 9500);
  const ratingAvg = Math.round((3 + rand() * 2) * 10) / 10;
  const ratingCount = 10 + Math.floor(rand() * 490);
  const downloads = 100 + Math.floor(rand() * 9900);
  const createdAt = Date.UTC(2025, 0, 1) + idx * 86400000; // spread over 24 days
  const title = `${prefix} ${kind.replace('_', ' ')} ${noun}`;

  const base: MarketplaceListing = {
    id: makeId(idx),
    catalog_id: `cat_${((idx % 5) + 1).toString().padStart(3, '0')}`,
    seller_id: `seller_${creator.toLowerCase().replace(/\s+/g, '')}`,
    title,
    description: `A ${theme} ${color} ${kind.replace('_', ' ')} crafted by ${creator}.`,
    status: 'published',
    is_free: isFree,
    price_cents: priceCents,
    currency: CURRENCY,
    tags: [kind, theme, color, language],
    published_at_ms: createdAt,
    version: `1.${(idx % 9) + 1}.0`,
    created_at: createdAt,
    updated_at: createdAt + 86400000,
  };

  return {
    ...base,
    kind,
    price_model: isFree ? 'free' : 'one_time',
    slug: makeSlug(title),
    creator_name: creator,
    rating_avg: ratingAvg,
    rating_count: ratingCount,
    download_count: downloads,
  };
}

const ALL: ReadonlyArray<MarketplaceListingWithMeta> = Array.from(
  { length: 24 },
  (_, i) => buildListing(i),
);

/* ── Helpers ────────────────────────────────────────────────────────── */

function matchesQuery(l: MarketplaceListingWithMeta, q: string): boolean {
  const needle = q.toLowerCase();
  if (l.title.toLowerCase().includes(needle)) return true;
  if (l.description && l.description.toLowerCase().includes(needle)) return true;
  if (l.tags?.some((t) => t.toLowerCase().includes(needle))) return true;
  if (l.seller_id.toLowerCase().includes(needle)) return true;
  return false;
}

function buildFacets(items: ReadonlyArray<MarketplaceListingWithMeta>): SearchFacets {
  const kindCounts = new Map<ListingKind, number>();
  const themeCounts = new Map<string, number>();
  const colorCounts = new Map<string, number>();
  const langCounts = new Map<string, number>();
  const ratingCounts = new Map<number, number>();
  let free = 0;
  let paid = 0;

  for (const l of items) {
    if (l.kind) kindCounts.set(l.kind, (kindCounts.get(l.kind) ?? 0) + 1);
    for (const tag of l.tags ?? []) {
      if (THEMES.includes(tag)) themeCounts.set(tag, (themeCounts.get(tag) ?? 0) + 1);
      if (COLORS.includes(tag)) colorCounts.set(tag, (colorCounts.get(tag) ?? 0) + 1);
      if (LANGUAGES.includes(tag)) langCounts.set(tag, (langCounts.get(tag) ?? 0) + 1);
    }
    if (l.is_free) free++;
    else paid++;
    const ratingBucket = Math.floor(l.rating_avg ?? 0);
    ratingCounts.set(ratingBucket, (ratingCounts.get(ratingBucket) ?? 0) + 1);
  }

  return {
    kind: KINDS.map((value) => ({
      value,
      count: kindCounts.get(value) ?? 0,
    })).filter((entry) => entry.count > 0),
    theme: Array.from(themeCounts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count),
    color: Array.from(colorCounts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count),
    language: Array.from(langCounts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count),
    price: { free, paid },
    rating: Array.from(ratingCounts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.value - a.value),
  };
}

function applySort(
  items: ReadonlyArray<MarketplaceListingWithMeta>,
  sort: SearchQuery['sort'],
): ReadonlyArray<MarketplaceListingWithMeta> {
  const sorted = [...items];
  switch (sort) {
    case 'newest':
      sorted.sort((a, b) => b.created_at - a.created_at);
      break;
    case 'top-rated':
      sorted.sort((a, b) => (b.rating_avg ?? 0) - (a.rating_avg ?? 0));
      break;
    case 'most-downloaded':
      sorted.sort((a, b) => (b.download_count ?? 0) - (a.download_count ?? 0));
      break;
    case 'price-asc':
      sorted.sort((a, b) => a.price_cents - b.price_cents);
      break;
    case 'price-desc':
      sorted.sort((a, b) => b.price_cents - a.price_cents);
      break;
    case 'relevance':
    default:
      // Stable: keep seed order
      break;
  }
  return sorted;
}

/* ── Public API ─────────────────────────────────────────────────────── */

export async function searchListings(query: SearchQuery): Promise<SearchResult> {
  let items: ReadonlyArray<MarketplaceListingWithMeta> = ALL;

  if (query.q) {
    items = items.filter((l) => matchesQuery(l, query.q!));
  }
  if (query.kind) {
    items = items.filter((l) => l.kind === query.kind);
  }
  if (query.theme) {
    items = items.filter((l) => l.tags?.includes(query.theme!));
  }
  if (query.color) {
    items = items.filter((l) => l.tags?.includes(query.color!));
  }
  if (query.language) {
    items = items.filter((l) => l.tags?.includes(query.language!));
  }
  if (typeof query.price_min_cents === 'number') {
    items = items.filter((l) => l.price_cents >= query.price_min_cents!);
  }
  if (typeof query.price_max_cents === 'number') {
    items = items.filter((l) => l.price_cents <= query.price_max_cents!);
  }
  if (typeof query.min_rating === 'number') {
    items = items.filter((l) => (l.rating_avg ?? 0) >= query.min_rating!);
  }

  const total = items.length;
  items = applySort(items, query.sort);

  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.max(1, query.page_size ?? 12);
  const start = (page - 1) * pageSize;
  const paginated = items.slice(start, start + pageSize);
  const facets = buildFacets(items);

  return {
    items: paginated,
    total,
    page,
    page_size: pageSize,
    facets,
  };
}

export async function getFeatured(): Promise<MarketplaceListingWithMeta[]> {
  // Top by rating * downloads — hand-picked feel
  const sorted = [...ALL].sort((a, b) => {
    const scoreA = (a.rating_avg ?? 0) * (a.download_count ?? 1);
    const scoreB = (b.rating_avg ?? 0) * (b.download_count ?? 1);
    return scoreB - scoreA;
  });
  return sorted.slice(0, 4);
}

export async function getTopRated(): Promise<MarketplaceListingWithMeta[]> {
  return [...ALL]
    .sort((a, b) => (b.rating_avg ?? 0) - (a.rating_avg ?? 0))
    .slice(0, 6);
}

export async function getRecentlyAdded(): Promise<MarketplaceListingWithMeta[]> {
  return [...ALL].sort((a, b) => b.created_at - a.created_at).slice(0, 6);
}

export async function getByCategory(): Promise<Record<ListingKind, MarketplaceListingWithMeta[]>> {
  const result: Record<ListingKind, MarketplaceListingWithMeta[]> = {
    component: [],
    template: [],
    theme: [],
    sticker_pack: [],
    icon_pack: [],
  };
  for (const l of ALL) {
    if (!l.kind) continue;
    if (result[l.kind].length < 4) result[l.kind].push(l);
  }
  return result;
}

/**
 * Fetch related listings for a given listing id.
 * Returns up to 4 other listings (excluding the source) sorted by kind match.
 */
export async function getRelatedListings(
  listingId: string,
): Promise<ReadonlyArray<ListingCardVM>> {
  const source = ALL.find((l) => l.id === listingId);
  const others = ALL.filter((l) => l.id !== listingId);
  if (source?.kind) {
    others.sort((a, b) => {
      const aMatch = a.kind === source.kind ? 1 : 0;
      const bMatch = b.kind === source.kind ? 1 : 0;
      return bMatch - aMatch;
    });
  }
  return others.slice(0, 4).map(toCardVM);
}

/** Convert a `MarketplaceListingWithMeta` into a `ListingCardVM`
 *  for the existing `ListingCard` component. */
export function toCardVM(l: MarketplaceListingWithMeta): ListingCardVM {
  const vm: ListingCardVM = {
    id: l.id,
    slug: l.slug ?? l.id,
    title: l.title,
    kind: l.kind ?? 'component',
    price_cents: l.price_cents,
    currency: l.currency,
    is_free: l.is_free,
    price_model: l.price_model ?? 'one_time',
    creator_name: l.creator_name ?? l.seller_id,
    rating_avg: l.rating_avg ?? 0,
    rating_count: l.rating_count ?? 0,
    download_count: l.download_count ?? 0,
    tags: l.tags ?? [],
    created_at: l.created_at,
  };
  if (l.creator_avatar) vm.creator_avatar = l.creator_avatar;
  if (l.preview?.poster_ref) vm.poster_url = l.preview.poster_ref;
  return vm;
}
