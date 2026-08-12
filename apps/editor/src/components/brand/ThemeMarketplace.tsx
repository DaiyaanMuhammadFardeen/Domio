'use client';

/**
 * ThemeMarketplace — browse marketplace themes, preview live, install
 * with one click.
 *
 * Per Wave 2 §S2.5 of docs/frontend-roadmap/02-wave-editor-surface.md.
 *
 * The component consumes the existing `MarketplacePanel` listings
 * (filtered by `kind === 'theme'`) and adapts them into an installer:
 * each row shows the listing's primary colors + a "Preview" button
 * that opens a modal with a quick demo (heading + body + cta).
 * Hitting "Install" emits a theme the host can apply.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import {
  fetchCuratedListings,
  type CuratedListingView,
} from '../../lib/marketplace-service';
import type { ThemeDetail } from '../../lib/brand-service';
import { contrastFor, generateColorScale } from '../../lib/design-tokens';

export interface ThemeMarketplaceProps {
  /** Active brand kit id used to filter listings. */
  brandKitId: string;
  /**
   * Called with a newly-installed theme. Hosts persist this via the
   * engine bridge + the editor's theme slice.
   */
  onInstall: (theme: ThemeDetail) => void;
  /** Optionally inject the fetcher for tests. */
  fetchListings?: typeof fetchCuratedListings;
  /** Optional test id. */
  id?: string | undefined;
}

export function ThemeMarketplace(props: ThemeMarketplaceProps): ReactElement {
  const { brandKitId, onInstall, id } = props;
  const fetchImpl = props.fetchListings ?? fetchCuratedListings;
  const [items, setItems] = useState<readonly CuratedListingView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [installedId, setInstalledId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchImpl(brandKitId, 40, 0)
      .then((page) => {
        if (cancelled) return;
        setItems(page.items.filter((i) => (i.kind ?? 'component') === 'theme'));
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [brandKitId, fetchImpl]);

  const previewListing = useMemo(
    () => items.find((i) => i.listing_id === previewId) ?? null,
    [items, previewId],
  );

  const handleInstall = useCallback(
    (listing: CuratedListingView) => {
      // The listing doesn't carry an actual token set; derive one
      // deterministically from the listing slug so the install
      // produces a stable ThemeDetail.
      const seedHex = pickAccentHex(listing);
      const palette = generateColorScale(seedHex, { id: 'color.brand.primary', label: 'Primary' });
      const tokens: Record<string, string> = {
        'color.brand.primary': palette.stops[4]?.value ?? seedHex,
        'color.brand.accent': listing.poster_ref ?? '#58a6ff',
        'color.bg': '#ffffff',
        'color.fg': '#0a0e14',
        'color.muted': '#7d8590',
        'color.border': '#d0d7de',
      };
      const theme: ThemeDetail = {
        id: `marketplace-${listing.listing_id}`,
        name: listing.title,
        scheme: 'light',
        isDark: false,
        tokens,
      };
      onInstall(theme);
      setInstalledId(listing.listing_id);
    },
    [onInstall],
  );

  return (
    <section className="theme-marketplace" data-testid={id ?? 'theme-marketplace'}>
      <header className="theme-marketplace__head">
        <h3 className="theme-marketplace__title">Theme marketplace</h3>
        <p className="theme-marketplace__sub">
          Preview + install community themes for {brandKitId || 'all'} brand kits.
        </p>
      </header>

      {loading && <div className="theme-marketplace__loading">Loading…</div>}
      {error && (
        <div className="theme-marketplace__error" data-testid="theme-marketplace-error">
          {error}
        </div>
      )}

      <ul className="theme-marketplace__grid" data-testid="theme-marketplace-grid">
        {items.map((listing) => (
          <li
            key={listing.listing_id}
            className={`theme-marketplace__card${installedId === listing.listing_id ? ' is-installed' : ''}`}
            data-testid={`theme-marketplace-card-${listing.listing_id}`}
          >
            <div
              className="theme-marketplace__poster"
              style={{
                background: listing.poster_ref ?? pickAccentHex(listing),
                color: contrastFor(listing.poster_ref ?? pickAccentHex(listing)),
              }}
            >
              {listing.title.charAt(0).toUpperCase()}
            </div>
            <div className="theme-marketplace__meta">
              <h4 className="theme-marketplace__name">{listing.title}</h4>
              <p className="theme-marketplace__seller">{listing.seller_name ?? 'Anonymous'}</p>
              <p className="theme-marketplace__price">
                {listing.is_free
                  ? 'Free'
                  : `${(listing.price_cents / 100).toFixed(2)} ${listing.currency}`}
              </p>
            </div>
            <div className="theme-marketplace__actions">
              <button
                type="button"
                className="theme-marketplace__preview"
                onClick={() => setPreviewId(listing.listing_id)}
                data-testid={`theme-marketplace-preview-${listing.listing_id}`}
              >
                Preview
              </button>
              <button
                type="button"
                className="theme-marketplace__install"
                onClick={() => handleInstall(listing)}
                data-testid={`theme-marketplace-install-${listing.listing_id}`}
              >
                {installedId === listing.listing_id ? 'Installed' : 'Install'}
              </button>
            </div>
          </li>
        ))}
        {items.length === 0 && !loading && (
          <li className="theme-marketplace__empty">No themes match the current brand kit.</li>
        )}
      </ul>

      {previewListing && (
        <ThemePreviewModal
          listing={previewListing}
          onClose={() => setPreviewId(null)}
          onInstall={() => {
            handleInstall(previewListing);
            setPreviewId(null);
          }}
        />
      )}
    </section>
  );
}

function ThemePreviewModal({
  listing,
  onClose,
  onInstall,
}: {
  listing: CuratedListingView;
  onClose: () => void;
  onInstall: () => void;
}): ReactElement {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const seedHex = pickAccentHex(listing);
  const palette = generateColorScale(seedHex, { id: 'color.brand.primary', label: 'Primary' });

  return (
    <div className="theme-marketplace__modal" role="dialog" aria-modal="true" data-testid="theme-marketplace-modal">
      <div className="theme-marketplace__modal-backdrop" onClick={onClose} />
      <div className="theme-marketplace__modal-panel">
        <header className="theme-marketplace__modal-head">
          <h3>{listing.title}</h3>
          <button type="button" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div
          className="theme-marketplace__modal-preview"
          style={{
            background: palette.stops[0]?.value,
            color: contrastFor(palette.stops[0]?.value ?? '#000'),
          }}
        >
          <h4 style={{ fontFamily: 'Inter', fontSize: 28, margin: '0 0 8px' }}>
            {listing.title}
          </h4>
          <p style={{ fontFamily: 'Inter', fontSize: 14, lineHeight: 1.5, opacity: 0.85 }}>
            {listing.description ??
              'A live preview of the theme on a representative canvas layout.'}
          </p>
          <button
            type="button"
            style={{
              background: palette.stops[4]?.value ?? seedHex,
              color: contrastFor(palette.stops[4]?.value ?? seedHex),
              border: 0,
              padding: '8px 16px',
              borderRadius: 8,
              marginTop: 12,
            }}
          >
            Primary action
          </button>
        </div>
        <footer className="theme-marketplace__modal-foot">
          <button type="button" onClick={onClose}>Close</button>
          <button
            type="button"
            className="theme-marketplace__install"
            onClick={onInstall}
            data-testid="theme-marketplace-install-modal"
          >
            Install theme
          </button>
        </footer>
      </div>
    </div>
  );
}

/** Pick a deterministic hex from the listing so demos are stable. */
function pickAccentHex(listing: CuratedListingView): string {
  if (listing.poster_ref) return listing.poster_ref;
  const palette = [
    '#0a2540',
    '#5b21b6',
    '#15803d',
    '#7c2d12',
    '#0f172a',
    '#aa3a14',
    '#58a6ff',
  ];
  let h = 0;
  for (let i = 0; i < listing.listing_id.length; i++) {
    h = (h * 31 + listing.listing_id.charCodeAt(i)) >>> 0;
  }
  return palette[h % palette.length]!;
}
