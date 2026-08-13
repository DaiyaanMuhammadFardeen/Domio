/**
 * Stock photos — bootstrap seam for the Insert → Stock panel.
 *
 * Per Wave 2 §S2.4 of docs/frontend-roadmap/02-wave-editor-surface.md:
 *   "Stock (Unsplash/Pexels)"
 *
 * The real implementation would defer to Unsplash / Pexels /
 * services/media-index via fetch(). Until the backend is wired, this
 * module ships a curated local catalog so the panel is fully usable
 * in editor-only mode. The fetch API is documented below as a
 * NOT-YET-IMPLEMENTED seam so the next backend worker can drop in
 * a real client without touching the InsertPanel.
 */

export interface StockPhoto {
  id: string;
  title: string;
  attribution: string;
  /** Unsplash/Pexels CDN URL or local placeholder. */
  url: string;
  thumb: string;
  tags: readonly string[];
  source: 'unsplash' | 'pexels' | 'local';
}

export const STOCK_PHOTOS: readonly StockPhoto[] = [
  {
    id: 'stock-office-1',
    title: 'Modern office',
    attribution: 'Curated',
    url: '/stock/office-1.jpg',
    thumb: '/stock/office-1-thumb.jpg',
    tags: ['office', 'team', 'meeting'],
    source: 'local',
  },
  {
    id: 'stock-city-1',
    title: 'City skyline',
    attribution: 'Curated',
    url: '/stock/city-1.jpg',
    thumb: '/stock/city-1-thumb.jpg',
    tags: ['city', 'skyline', 'business'],
    source: 'local',
  },
  {
    id: 'stock-data-1',
    title: 'Abstract data',
    attribution: 'Curated',
    url: '/stock/data-1.jpg',
    thumb: '/stock/data-1-thumb.jpg',
    tags: ['data', 'abstract', 'chart'],
    source: 'local',
  },
  {
    id: 'stock-nature-1',
    title: 'Forest',
    attribution: 'Curated',
    url: '/stock/nature-1.jpg',
    thumb: '/stock/nature-1-thumb.jpg',
    tags: ['nature', 'forest', 'wellness'],
    source: 'local',
  },
  {
    id: 'stock-people-1',
    title: 'Team meeting',
    attribution: 'Curated',
    url: '/stock/people-1.jpg',
    thumb: '/stock/people-1-thumb.jpg',
    tags: ['people', 'team', 'meeting'],
    source: 'local',
  },
  {
    id: 'stock-product-1',
    title: 'Product mockup',
    attribution: 'Curated',
    url: '/stock/product-1.jpg',
    thumb: '/stock/product-1-thumb.jpg',
    tags: ['product', 'design', 'mockup'],
    source: 'local',
  },
];

export interface StockSearchOptions {
  query?: string;
  source?: 'unsplash' | 'pexels' | 'local' | 'all';
  page?: number;
  pageSize?: number;
}

export interface StockSearchResult {
  photos: readonly StockPhoto[];
  total: number;
  page: number;
  pageSize: number;
  /** True when the local fallback is being used because the live API is unavailable. */
  fallback: boolean;
}

/**
 * Search the stock catalog. The current implementation returns the
 * curated local list; the real implementation will defer to
 * Unsplash/Pexels via the media-index service.
 *
 * NOT-YET-IMPLEMENTED: replace the body of this function with a fetch
 * to services/media-index. The InsertPanel already handles the
 * `fallback` flag for graceful degradation.
 */
export async function searchStock(options: StockSearchOptions = {}): Promise<StockSearchResult> {
  const { query = '', source = 'all', page = 1, pageSize = 50 } = options;
  const q = query.trim().toLowerCase();
  let filtered: readonly StockPhoto[] = STOCK_PHOTOS;
  if (source !== 'all') {
    filtered = filtered.filter((p) => p.source === source);
  }
  if (q) {
    filtered = filtered.filter(
      (p) => p.title.toLowerCase().includes(q) || p.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  return {
    photos: filtered.slice(start, end),
    total: filtered.length,
    page,
    pageSize,
    fallback: true,
  };
}
