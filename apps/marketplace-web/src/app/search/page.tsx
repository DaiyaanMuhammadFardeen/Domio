'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale } from '@/hooks/useLocale';
import { SearchBar } from '@/components/SearchBar';
import { FacetSidebar } from '@/components/FacetSidebar';
import { SortDropdown } from '@/components/SortDropdown';
import { ListingCard } from '@/components/ListingCard';
import { ListingGridSkeleton } from '@/components/LoadingSkeletons';
import { EmptyState } from '@/components/EmptyState';
import { searchListings, toCardVM } from '@/lib/search-service';
import type { SearchResult, SearchSort } from '@/lib/types';

const PAGE_SIZE = 9;

export default function SearchPage() {
  const { t } = useLocale();

  const [q, setQ] = useState('');
  const [kind, setKind] = useState<ReadonlyArray<string>>([]);
  const [theme, setTheme] = useState<ReadonlyArray<string>>([]);
  const [color, setColor] = useState<ReadonlyArray<string>>([]);
  const [language, setLanguage] = useState<ReadonlyArray<string>>([]);
  const [price, setPrice] = useState<'free' | 'paid' | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [sort, setSort] = useState<SearchSort>('relevance');
  const [page, setPage] = useState(1);

  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(true);

  const runSearch = useCallback(async () => {
    setLoading(true);
    try {
      const out = await searchListings({
        q: q || undefined,
        kind: kind[0] as never,
        theme: theme[0],
        color: color[0],
        language: language[0],
        min_rating: rating ?? undefined,
        sort,
        page,
        page_size: PAGE_SIZE,
        price_max_cents: price === 'free' ? 0 : undefined,
      });
      setResult(out);
    } finally {
      setLoading(false);
    }
  }, [q, kind, theme, color, language, price, rating, sort, page]);

  useEffect(() => {
    void runSearch();
  }, [runSearch]);

  const toggleIn = (list: ReadonlyArray<string>, value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const totalPages = useMemo(() => {
    if (!result) return 1;
    return Math.max(1, Math.ceil(result.total / result.page_size));
  }, [result]);

  const facets = result?.facets;
  const items = result?.items ?? [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8" data-testid="search-page">
      <h1 className="mb-6 font-display text-3xl font-bold text-fg">
        {t('market.search.heading')}
      </h1>

      <div className="mb-8">
        <SearchBar value={q} onChange={(v) => { setQ(v); setPage(1); }} syncToUrl />
      </div>

      <div className="flex flex-col gap-8 pb-16 lg:flex-row">
        {facets && (
          <FacetSidebar
            facets={facets}
            selectedKind={kind}
            selectedTheme={theme}
            selectedColor={color}
            selectedLanguage={language}
            selectedPrice={price}
            selectedRating={rating}
            onKindToggle={(v) => { setKind(toggleIn(kind, v)); setPage(1); }}
            onThemeToggle={(v) => { setTheme(toggleIn(theme, v)); setPage(1); }}
            onColorToggle={(v) => { setColor(toggleIn(color, v)); setPage(1); }}
            onLanguageToggle={(v) => { setLanguage(toggleIn(language, v)); setPage(1); }}
            onPriceChange={(v) => { setPrice(v); setPage(1); }}
            onRatingChange={(v) => { setRating(v); setPage(1); }}
            onClear={() => {
              setKind([]);
              setTheme([]);
              setColor([]);
              setLanguage([]);
              setPrice(null);
              setRating(null);
              setPage(1);
            }}
          />
        )}

        <div className="flex-1 min-w-0">
          <div className="mb-6 flex items-center justify-between">
            <p className="text-sm text-muted" data-testid="search-results-count">
              {result &&
                t('market.search.results', { total: result.total })}
            </p>
            <SortDropdown
              value={sort}
              onChange={(s) => { setSort(s); setPage(1); }}
            />
          </div>

          {loading ? (
            <ListingGridSkeleton />
          ) : items.length === 0 ? (
            <EmptyState message={t('market.search.noResults')} />
          ) : (
            <div
              data-testid="search-results"
              className="stagger grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
            >
              {items.map((item) => (
                <ListingCard key={item.id} listing={toCardVM(item)} />
              ))}
            </div>
          )}

          <nav
            aria-label="Pagination"
            className="mt-10 flex items-center justify-center gap-3"
            data-testid="search-pagination"
          >
            <button
              type="button"
              data-testid="search-pagination-prev"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-lg border border-border bg-panel px-4 py-2 text-sm font-medium text-fg transition-colors hover:border-accent/40 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ‹ Prev
            </button>
            <span className="text-sm text-muted">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              data-testid="search-pagination-next"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded-lg border border-border bg-panel px-4 py-2 text-sm font-medium text-fg transition-colors hover:border-accent/40 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next ›
            </button>
          </nav>
        </div>
      </div>
    </div>
  );
}
