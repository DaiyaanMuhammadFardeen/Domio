'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocale } from '@/hooks/useLocale';
import { listMarketplaceListings } from '@/lib/api';
import type { MarketplaceListing, ListingKind, PriceModel, ListingCardVM } from '@/lib/types';
import { SearchBar } from '@/components/SearchBar';
import { FacetSidebar } from '@/components/FacetSidebar';
import { ListingCard } from '@/components/ListingCard';
import { ListingGridSkeleton } from '@/components/LoadingSkeletons';
import { EmptyState, ErrorState } from '@/components/EmptyState';

/* ── Map raw listing to view model ──────────────────────────────────── */

function listingToVM(raw: MarketplaceListing): ListingCardVM {
  // Infer kind from tags or default to component
  const tags = raw.tags ?? [];
  const kind: ListingKind =
    (tags.find((t) =>
      ['component', 'template', 'theme', 'sticker_pack', 'icon_pack'].includes(t),
    ) as ListingKind) ?? 'component';

  const priceModel: PriceModel = raw.is_free
    ? 'free'
    : raw.price_cents > 0
      ? 'one_time'
      : 'free';

  return {
    id: raw.id,
    slug: raw.id, // slug not in API — fallback to id
    title: raw.title,
    kind,
    price_cents: raw.price_cents,
    currency: raw.currency,
    is_free: raw.is_free,
    price_model: priceModel,
    creator_name: raw.seller_id,
    rating_avg: 0,
    rating_count: 0,
    download_count: 0,
    poster_url: raw.preview?.poster_ref,
    tags,
    created_at: raw.created_at,
  };
}

/* ── Home page (client component — manages interactive state) ──────── */

export default function HomePage() {
  const { t } = useLocale();

  // Data
  const [listings, setListings] = useState<ListingCardVM[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<ListingKind | undefined>();
  const [priceModel, setPriceModel] = useState<PriceModel | undefined>();
  const [sort, setSort] = useState<string>('newest');

  const fetchListings = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [listingRes] = await Promise.all([
        listMarketplaceListings({ status: 'published' }),
      ]);
      const vms = listingRes.items.map(listingToVM);
      setListings(vms);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  // Client-side filtering
  const filtered = useMemo(() => {
    let result = listings;

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (l) =>
          l.title.toLowerCase().includes(q) ||
          l.creator_name.toLowerCase().includes(q) ||
          l.tags.some((tag) => tag.toLowerCase().includes(q)),
      );
    }

    if (kind) {
      result = result.filter((l) => l.kind === kind);
    }

    if (priceModel) {
      if (priceModel === 'free') {
        result = result.filter((l) => l.is_free);
      } else {
        result = result.filter((l) => !l.is_free && l.price_model === priceModel);
      }
    }

    // Sort
    switch (sort) {
      case 'price_asc':
        result = [...result].sort((a, b) => a.price_cents - b.price_cents);
        break;
      case 'price_desc':
        result = [...result].sort((a, b) => b.price_cents - a.price_cents);
        break;
      case 'rating':
        result = [...result].sort((a, b) => b.rating_avg - a.rating_avg);
        break;
      case 'popular':
        result = [...result].sort((a, b) => b.download_count - a.download_count);
        break;
      case 'newest':
      default:
        result = [...result].sort((a, b) => b.created_at - a.created_at);
        break;
    }

    return result;
  }, [listings, search, kind, priceModel, sort]);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="py-12 text-center sm:py-16">
        <h1 className="font-display text-3xl font-bold tracking-tight text-fg text-balance sm:text-4xl lg:text-5xl">
          {t('hero.title')}
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-muted sm:text-lg">
          {t('hero.subtitle')}
        </p>
        <div className="mx-auto mt-8 max-w-lg">
          <SearchBar value={search} onChange={setSearch} />
        </div>
      </section>

      {/* ── Content ──────────────────────────────────────────────── */}
      <div className="flex flex-col gap-8 pb-16 lg:flex-row">
        {/* Sidebar */}
        <FacetSidebar
          selectedKind={kind}
          selectedPrice={priceModel}
          onKindChange={setKind}
          onPriceChange={setPriceModel}
        />

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Sort bar */}
          <div className="mb-6 flex items-center justify-between">
            <p className="text-sm text-muted">
              {!loading && !error && (
                <>
                  {filtered.length} {filtered.length === 1 ? 'listing' : 'listings'}
                </>
              )}
            </p>
            <div className="flex items-center gap-2">
              <label htmlFor="sort-select" className="sr-only">Sort by</label>
              <select
                id="sort-select"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="rounded-lg border border-border bg-panel px-3 py-1.5 text-xs font-medium text-fg transition-colors hover:border-accent/40 focus:border-accent focus:outline-none"
              >
                <option value="newest">{t('sort.newest')}</option>
                <option value="popular">{t('sort.popular')}</option>
                <option value="price_asc">{t('sort.priceLow')}</option>
                <option value="price_desc">{t('sort.priceHigh')}</option>
                <option value="rating">{t('sort.rating')}</option>
              </select>
            </div>
          </div>

          {/* Grid */}
          {error ? (
            <ErrorState onRetry={fetchListings} />
          ) : loading ? (
            <ListingGridSkeleton />
          ) : filtered.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="stagger grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
