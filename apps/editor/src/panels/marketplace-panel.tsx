/**
 * MarketplacePanel — Phase 19, Wave 5, WS-MKT-1.
 *
 * Insert → Marketplace surface with brand-locked curated listings.
 * Fetching is injected via `fetchListings` for testability (same
 * pattern as LicenseDashboard). Falls back to localStorage cache
 * on network failure so the panel never crashes.
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { MagicCard } from '../components/ui/magic-card';
import { Marquee } from '../components/ui/marquee';
import { useT } from '../lib/locale';

// ─── Types (aligned with contracts/openapi/v1/marketplace-service.yaml) ─────

/** Mirrors the CuratedListing schema from the OpenAPI spec. */
export interface CuratedListingView {
  readonly listing_id: string;
  readonly title: string;
  readonly slug: string;
  readonly is_free: boolean;
  readonly price_cents: number;
  readonly currency: string;
  readonly override_price_cents: number | null;
  readonly brand_locked_state: 'allow' | 'override' | 'deny';
  /** Optional — may be added by future API revisions. */
  readonly kind?: string;
  readonly description?: string;
  readonly seller_name?: string;
  readonly version?: string;
  readonly poster_ref?: string;
}

export interface CuratedListingPage {
  readonly items: readonly CuratedListingView[];
  readonly total: number;
}

export type ListingKind = 'component' | 'template' | 'theme' | 'sticker_pack' | 'icon_pack';

const KIND_LABELS: Record<ListingKind, string> = {
  component: 'Component',
  template: 'Template',
  theme: 'Theme',
  sticker_pack: 'Sticker Pack',
  icon_pack: 'Icon Pack',
};

const ALL_KINDS: ListingKind[] = ['component', 'template', 'theme', 'sticker_pack', 'icon_pack'];

// ─── Props ──────────────────────────────────────────────────────────────────

export interface MarketplacePanelProps {
  /** Called when the user clicks Insert. catalogId = listing_id, version is optional. */
  onInsert: (catalogId: string, version?: string) => void;
  /** Brand kit ID from editor context. Undefined = no brand filter. */
  brandKitId?: string;
  /** Injectable data fetcher for tests and production. */
  fetchListings?: (brandKitId: string, limit: number, offset: number) => Promise<CuratedListingPage>;
}

// ─── Default fetcher ────────────────────────────────────────────────────────

const API_BASE: string =
  (typeof process !== 'undefined'
    ? (process.env.NEXT_PUBLIC_API_URL as string | undefined)
    : undefined) ?? 'http://localhost:8080';

async function defaultFetchListings(
  brandKitId: string,
  limit: number,
  offset: number,
): Promise<CuratedListingPage> {
  const params = new URLSearchParams({
    brand_kit_id: brandKitId,
    limit: String(limit),
    offset: String(offset),
  });
  const res = await fetch(`${API_BASE}/v1/marketplace/curated?${params}`);
  if (!res.ok) {
    throw new Error(`Marketplace API ${res.status}: ${res.statusText}`);
  }
  return res.json() as Promise<CuratedListingPage>;
}

// ─── Cache helpers ──────────────────────────────────────────────────────────

const CACHE_KEY = 'domio.marketplace.cache';

function readCache(): CuratedListingPage | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CuratedListingPage;
  } catch {
    return null;
  }
}

function writeCache(page: CuratedListingPage): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(page));
  } catch {
    /* quota exceeded — ignore */
  }
}

// ─── Price formatter ────────────────────────────────────────────────────────

function formatPrice(cents: number, currency: string): string {
  if (cents === 0) return 'Free';
  const amount = cents / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

const PAGE_SIZE = 40;

export function MarketplacePanel({
  onInsert,
  brandKitId = '',
  fetchListings = defaultFetchListings,
}: MarketplacePanelProps): ReactElement {
  const t = useT();
  const [listings, setListings] = useState<readonly CuratedListingView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usedCache, setUsedCache] = useState(false);
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<ListingKind | 'all'>('all');

  // Fetch curated listings
  useEffect(() => {
    if (!brandKitId) {
      setListings([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setUsedCache(false);

    fetchListings(brandKitId, PAGE_SIZE, 0)
      .then((page) => {
        if (cancelled) return;
        setListings(page.items);
        writeCache(page);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // Stale-cache degradation
        const cached = readCache();
        if (cached) {
          setListings(cached.items);
          setUsedCache(true);
        }
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [brandKitId, fetchListings]);

  // Filtering
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return listings.filter((item) => {
      if (kindFilter !== 'all' && item.kind !== kindFilter) return false;
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        item.slug.toLowerCase().includes(q) ||
        (item.description ?? '').toLowerCase().includes(q)
      );
    });
  }, [listings, query, kindFilter]);

  const marqueeItems = useMemo(
    () => listings.slice(0, 12).map((l) => l.title),
    [listings],
  );

  // ── Loading ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <section className="marketplace-panel" data-testid="marketplace-panel">
        <header className="marketplace-panel__header">
          <h2 className="marketplace-panel__title">{t('marketplace.title')}</h2>
        </header>
        <p className="marketplace-panel__loading" data-testid="marketplace-loading">{t('marketplace.loading')}</p>
      </section>
    );
  }

  // ── Error (with possible stale cache) ───────────────────────────────────
  if (error && !usedCache) {
    return (
      <section className="marketplace-panel" data-testid="marketplace-panel">
        <header className="marketplace-panel__header">
          <h2 className="marketplace-panel__title">{t('marketplace.title')}</h2>
        </header>
        <p className="marketplace-panel__error" role="alert" data-testid="marketplace-error">
          {t('marketplace.error')}
        </p>
      </section>
    );
  }

  // ── Empty (no brand kit selected) ──────────────────────────────────────
  if (!brandKitId) {
    return (
      <section className="marketplace-panel" data-testid="marketplace-panel">
        <header className="marketplace-panel__header">
          <h2 className="marketplace-panel__title">{t('marketplace.title')}</h2>
        </header>
        <p className="marketplace-panel__empty" data-testid="marketplace-empty-brand">
          {t('marketplace.selectBrandKit')}
        </p>
      </section>
    );
  }

  // ── Main view ──────────────────────────────────────────────────────────
  return (
    <section className="marketplace-panel" data-testid="marketplace-panel">
      <header className="marketplace-panel__header">
        <h2 className="marketplace-panel__title">{t('marketplace.title')}</h2>
        <p className="marketplace-panel__sub">
          {t('marketplace.itemsCount', { count: filtered.length })}
        </p>
      </header>

      {usedCache && (
        <p className="marketplace-panel__cache-note" data-testid="marketplace-cache-note" role="status">
          {t('marketplace.offlineCache')}
        </p>
      )}

      {marqueeItems.length > 0 && (
        <Marquee className="marketplace-panel__marquee" pauseOnHover>
          {marqueeItems.map((title) => (
            <span key={title} className="marketplace-panel__marquee-item">
              {title}
            </span>
          ))}
        </Marquee>
      )}

      <input
        type="search"
        className="marketplace-panel__search"
        placeholder={t('marketplace.searchPlaceholder')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label={t('marketplace.searchPlaceholder')}
      />

      <div className="marketplace-panel__kinds" role="tablist" aria-label={t('marketplace.kindFilter')}>
        <button
          type="button"
          role="tab"
          aria-selected={kindFilter === 'all'}
          className={`marketplace-panel__kind${kindFilter === 'all' ? ' is-active' : ''}`}
          onClick={() => setKindFilter('all')}
        >
          {t('marketplace.all')}
        </button>
        {ALL_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={kindFilter === k}
            className={`marketplace-panel__kind${kindFilter === k ? ' is-active' : ''}`}
            onClick={() => setKindFilter(k)}
          >
            {KIND_LABELS[k]}
          </button>
        ))}
      </div>

      <div className="marketplace-panel__grid" data-testid="marketplace-grid">
        {filtered.map((item) => (
          <MarketplaceCard
            key={item.listing_id}
            item={item}
            onInsert={() => onInsert(item.listing_id, item.version)}
          />
        ))}
        {filtered.length === 0 ? (
          <p className="marketplace-panel__empty" data-testid="marketplace-no-results">
            {t('marketplace.noResults', { query })}
          </p>
        ) : null}
      </div>
    </section>
  );
}

// ─── Listing Card ───────────────────────────────────────────────────────────

interface MarketplaceCardProps {
  item: CuratedListingView;
  onInsert: () => void;
}

function MarketplaceCard({ item, onInsert }: MarketplaceCardProps): ReactElement {
  const t = useT();
  const isDenied = item.brand_locked_state === 'deny';
  const isOverride = item.brand_locked_state === 'override';
  const displayPrice = isOverride && item.override_price_cents !== null
    ? item.override_price_cents
    : item.price_cents;
  const priceLabel = formatPrice(displayPrice, item.currency);
  const kindLabel = item.kind
    ? (KIND_LABELS[item.kind as ListingKind] ?? item.kind)
    : null;

  return (
    <MagicCard className="marketplace-card">
      <div className="marketplace-card__body">
        {/* Thumbnail */}
        <div className="marketplace-card__thumb" data-testid={`marketplace-thumb-${item.listing_id}`}>
          {item.poster_ref ? (
            <img
              src={item.poster_ref}
              alt={item.title}
              className="marketplace-card__img"
              loading="lazy"
            />
          ) : (
            <span className="marketplace-card__thumb-placeholder" aria-hidden="true">
              {item.title.charAt(0).toUpperCase()}
            </span>
          )}
        </div>

        {/* Meta */}
        <div className="marketplace-card__meta">
          <span className="marketplace-card__title">{item.title}</span>

          <div className="marketplace-card__badges">
            {kindLabel && (
              <span className="marketplace-card__badge marketplace-card__badge--kind">
                {kindLabel}
              </span>
            )}
            {isFree(item) && !isDenied && (
              <span className="marketplace-card__badge marketplace-card__badge--free">
                {t('marketplace.freeBadge')}
              </span>
            )}
            {item.version && (
              <span className="marketplace-card__badge marketplace-card__badge--version">
                v{item.version}
              </span>
            )}
          </div>

          {item.seller_name && (
            <span className="marketplace-card__creator">{item.seller_name}</span>
          )}

          {/* Price */}
          <span className="marketplace-card__price">
            {isOverride && item.override_price_cents !== null && (
              <>
                <span className="marketplace-card__price--original">
                  {formatPrice(item.price_cents, item.currency)}
                </span>
                {' '}
              </>
            )}
            {priceLabel}
          </span>

          {/* Brand-lock overlay */}
          {isDenied && (
            <div className="marketplace-card__lock" data-testid={`marketplace-lock-${item.listing_id}`}>
              <span className="marketplace-card__lock-icon" aria-hidden="true">&#128274;</span>
              <span className="marketplace-card__lock-text">{t('marketplace.brandLocked')}</span>
            </div>
          )}
          {isOverride && (
            <span className="marketplace-card__override-note" data-testid={`marketplace-override-${item.listing_id}`}>
              {t('marketplace.brandOverride')}
            </span>
          )}
        </div>
      </div>

      {/* Insert button */}
      <button
        type="button"
        className={`marketplace-card__insert${isDenied ? ' marketplace-card__insert--disabled' : ''}`}
        onClick={isDenied ? undefined : onInsert}
        disabled={isDenied}
        aria-disabled={isDenied}
        aria-label={isDenied ? t('marketplace.lockedInsertDisabled') : t('marketplace.insert')}
        data-testid={`marketplace-insert-${item.listing_id}`}
      >
        {isDenied ? t('marketplace.locked') : t('marketplace.insert')}
      </button>
    </MagicCard>
  );
}

function isFree(item: CuratedListingView): boolean {
  return item.is_free || item.price_cents === 0;
}
