/**
 * Per-creator profile page — Wave 9 S9.9.
 *
 * Header (avatar + bio + follow button + joined date + location),
 * stats row, listings grid, recent reviews, with loading + 404 states.
 */

'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useLocale } from '@/hooks/useLocale';
import {
  getCreator,
  getCreatorListings,
  getCreatorReviews,
  type CreatorProfile,
} from '@/lib/creator-service';
import { ListingCard } from '@/components/ListingCard';
import { CreatorProfileHeader } from '@/components/marketplace';
import { marketplaceWeb } from '@domio/ui/routing';
import type { ListingCardVM, Review } from '@/lib/types';

interface CreatorPageProps {
  readonly params: Promise<{ handle: string }>;
}

function StarRow({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <svg
          key={i}
          className={`h-3.5 w-3.5 ${i < rating ? 'text-gold' : 'text-border'}`}
          fill="currentColor"
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatHours(h: number): string {
  if (h < 1) return '<1h';
  if (h < 24) return `${h}h`;
  const days = Math.round(h / 24);
  return `${days}d`;
}

export default function CreatorProfilePage({ params }: CreatorPageProps) {
  const { handle } = use(params);
  const { t } = useLocale();

  const [creator, setCreator] = useState<CreatorProfile | null>(null);
  const [listings, setListings] = useState<ListingCardVM[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setNotFound(false);
      const profile = await getCreator(handle);
      if (cancelled) return;
      if (!profile) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setCreator(profile);
      const [l, r] = await Promise.allSettled([
        getCreatorListings(handle),
        getCreatorReviews(handle),
      ]);
      if (cancelled) return;
      if (l.status === 'fulfilled') setListings(l.value);
      if (r.status === 'fulfilled') setReviews(r.value);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [handle]);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8" data-testid="creator-page-loading">
        <div className="mb-10 flex items-start gap-6 border-b border-border pb-10">
          <div className="skeleton h-28 w-28 rounded-full" />
          <div className="flex-1 space-y-3">
            <div className="skeleton h-8 w-48" />
            <div className="skeleton h-4 w-32" />
            <div className="skeleton h-12 w-full max-w-xl" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-64 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (notFound || !creator) {
    return (
      <div
        className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6 lg:px-8"
        data-testid="creator-not-found"
      >
        <div className="mb-6 flex h-16 w-16 mx-auto items-center justify-center rounded-full bg-panel">
          <svg
            className="h-8 w-8 text-muted"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.182 16.318A4.486 4.486 0 0012.016 15a4.486 4.486 0 00-3.198 1.318M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <h1 className="font-display text-2xl font-bold text-fg">
          {t('market.creator.notFound')}
        </h1>
        <p className="mt-2 text-sm text-muted">@{handle}</p>
        <Link
          href={marketplaceWeb('home')}
          className="mt-8 inline-block rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          {t('market.creator.browseMarketplace')}
        </Link>
      </div>
    );
  }

  return (
    <div
      className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8"
      data-testid="creator-page"
    >
      {/* ── Back to marketplace ───────────────────────────────────── */}
      <nav className="mb-8">
        <Link
          href={marketplaceWeb('home')}
          className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-fg"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          {t('market.creator.browseMarketplace')}
        </Link>
      </nav>

      {/* ── Header ────────────────────────────────────────────────── */}
      <CreatorProfileHeader creator={creator} />

      {/* ── Stats row ─────────────────────────────────────────────── */}
      <section
        className="mt-10 grid grid-cols-2 gap-6 rounded-2xl border border-border bg-panel/60 px-6 py-6 sm:grid-cols-4"
        data-testid="creator-stats"
      >
        <StatBlock
          label={t('market.creator.stats.listings')}
          value={creator.listing_count.toString()}
        />
        <StatBlock
          label={t('market.creator.stats.sales')}
          value={creator.total_sales.toLocaleString('en-US')}
        />
        <StatBlock
          label={t('market.creator.stats.rating')}
          value={`${creator.avg_rating.toFixed(1)}★`}
        />
        <StatBlock
          label={t('market.creator.stats.responseTime')}
          value={formatHours(creator.response_time_hours)}
        />
      </section>

      {/* ── Listings grid ─────────────────────────────────────────── */}
      <section className="mt-12" data-testid="creator-listings">
        <h2 className="mb-6 font-display text-2xl font-bold text-fg">
          {t('market.creator.listings')}
        </h2>
        {listings.length === 0 ? (
          <p className="text-sm text-muted">—</p>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {listings.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        )}
      </section>

      {/* ── Reviews ───────────────────────────────────────────────── */}
      <section className="mt-12" data-testid="creator-reviews">
        <h2 className="mb-6 font-display text-2xl font-bold text-fg">
          {t('market.creator.reviews')}
        </h2>
        {reviews.length === 0 ? (
          <p className="text-sm text-muted">{t('marketplace.review.empty')}</p>
        ) : (
          <div className="space-y-4">
            {reviews.map((r) => (
              <article
                key={r.id}
                className="rounded-xl border border-border bg-surface p-4"
              >
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <StarRow rating={r.rating} />
                    {r.verified_buyer && (
                      <span className="rounded bg-success/12 px-1.5 py-0.5 text-[10px] font-medium text-success">
                        Verified buyer
                      </span>
                    )}
                  </div>
                  <time
                    className="text-xs text-muted"
                    dateTime={new Date(r.created_at).toISOString()}
                  >
                    {formatDate(r.created_at)}
                  </time>
                </div>
                <p className="text-sm leading-relaxed text-fg/80">{r.body}</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-display text-2xl font-bold text-fg">{value}</p>
      <p className="mt-1 text-[11px] uppercase tracking-wider text-muted">
        {label}
      </p>
    </div>
  );
}
