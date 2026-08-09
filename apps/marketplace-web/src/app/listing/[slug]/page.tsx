'use client';

import { useState, useEffect, useCallback, use } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useLocale } from '@/hooks/useLocale';
import {
  getMarketplaceListing,
  listMarketplaceReviews,
  getMarketplaceListingChangelog,
  listMarketplaceListings,
} from '@/lib/api';
import type {
  MarketplaceListing,
  Review,
  ChangelogEntry,
  ListingCardVM,
  ListingKind,
} from '@/lib/types';
import { PurchaseButton } from '@/components/PurchaseButton';
import { ReviewsList } from '@/components/ReviewsList';
import { ChangelogTimeline } from '@/components/ChangelogTimeline';
import { RelatedListings } from '@/components/RelatedListings';
import { ListingDetailSkeleton } from '@/components/LoadingSkeletons';
import { NotFoundState, ErrorState } from '@/components/EmptyState';

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

interface ListingPageProps {
  params: Promise<{ slug: string }>;
}

export default function ListingPage({ params }: ListingPageProps) {
  const { slug } = use(params);
  const searchParams = useSearchParams();
  const { t, formatPrice } = useLocale();

  const [listing, setListing] = useState<MarketplaceListing | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewsTotal, setReviewsTotal] = useState(0);
  const [changelog, setChangelog] = useState<ChangelogEntry[]>([]);
  const [related, setRelated] = useState<ListingCardVM[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const purchaseStatus = searchParams.get('purchase');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(false);
    setNotFound(false);

    try {
      // The slug in our URL maps to listing_id — try fetching by id
      const listingData = await getMarketplaceListing(slug);
      setListing(listingData);

      // Fetch reviews, changelog, and related in parallel
      const [reviewsRes, changelogData, relatedRes] = await Promise.allSettled([
        listMarketplaceReviews(listingData.id),
        getMarketplaceListingChangelog(listingData.id),
        listMarketplaceListings({ status: 'published' }),
      ]);

      if (reviewsRes.status === 'fulfilled') {
        setReviews(reviewsRes.value.items);
        setReviewsTotal(reviewsRes.value.total);
      }

      if (changelogData.status === 'fulfilled') {
        setChangelog(changelogData.value);
      }

      if (relatedRes.status === 'fulfilled') {
        const vms = relatedRes.value.items
          .filter((l) => l.id !== listingData.id)
          .slice(0, 3)
          .map((l): ListingCardVM => ({
            id: l.id,
            slug: l.id,
            title: l.title,
            kind: 'component' as ListingKind,
            price_cents: l.price_cents,
            currency: l.currency,
            is_free: l.is_free,
            price_model: 'one_time',
            creator_name: l.seller_id,
            rating_avg: 0,
            rating_count: 0,
            download_count: 0,
            poster_url: l.preview?.poster_ref,
            tags: l.tags ?? [],
            created_at: l.created_at,
          }));
        setRelated(vms);
      }
    } catch (err) {
      const isNotFound = err instanceof Error && 'body' in err
        ? (err as { body: { status: number } }).body?.status === 404
        : false;
      if (isNotFound) {
        setNotFound(true);
      } else {
        setError(true);
      }
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Loading
  if (loading) {
    return <ListingDetailSkeleton />;
  }

  // Error
  if (error) {
    return <ErrorState onRetry={fetchData} />;
  }

  // Not found
  if (notFound || !listing) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-12">
        <NotFoundState />
        <div className="mt-6 text-center">
          <Link
            href="/"
            className="text-sm text-accent hover:underline"
          >
            {t('detail.backToBrowse')}
          </Link>
        </div>
      </div>
    );
  }

  const priceText = formatPrice(listing.price_cents, listing.currency, listing.is_free);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
      {/* Purchase success/failed banner */}
      {purchaseStatus === 'success' && (
        <div className="mb-8 rounded-xl bg-success/8 p-4 text-center animate-fade-in" role="status">
          <p className="text-sm font-medium text-success">{t('checkout.success')}</p>
        </div>
      )}
      {purchaseStatus === 'cancelled' && (
        <div className="mb-8 rounded-xl bg-error/8 p-4 text-center animate-fade-in" role="alert">
          <p className="text-sm text-error">{t('checkout.failed')}</p>
        </div>
      )}

      {/* Back link */}
      <nav className="mb-8" aria-label="Breadcrumb">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-fg"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          {t('detail.backToBrowse')}
        </Link>
      </nav>

      {/* Main grid */}
      <div className="grid gap-8 lg:grid-cols-[1fr,360px]">
        {/* Left: preview + details */}
        <div className="space-y-8">
          {/* Preview hero */}
          <div className="aspect-video w-full overflow-hidden rounded-2xl bg-surface border border-border">
            {listing.preview?.poster_ref ? (
              <img
                src={listing.preview.poster_ref}
                alt={listing.title}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <svg className="h-16 w-16 text-border" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            )}
          </div>

          {/* Description */}
          {listing.description && (
            <section>
              <h2 className="mb-3 font-display text-base font-semibold text-fg">
                {t('detail.about')}
              </h2>
              <p className="text-sm leading-relaxed text-fg/70">
                {listing.description}
              </p>
            </section>
          )}

          {/* Reviews */}
          <section>
            <ReviewsList reviews={reviews} total={reviewsTotal} />
          </section>

          {/* Changelog */}
          <section>
            <ChangelogTimeline entries={changelog} />
          </section>
        </div>

        {/* Right: purchase sidebar */}
        <div className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          {/* Title + meta */}
          <div>
            <h1 className="font-display text-2xl font-bold text-fg sm:text-3xl">
              {listing.title}
            </h1>
            <p className="mt-2 text-sm text-muted">
              {listing.seller_id}
            </p>
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-4 text-xs text-muted">
            {listing.version && (
              <span className="flex items-center gap-1">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
                </svg>
                {t('detail.version')} {listing.version}
              </span>
            )}
            {listing.published_at_ms && (
              <span>
                {t('detail.lastUpdated')} {formatDate(listing.published_at_ms)}
              </span>
            )}
          </div>

          {/* Tags */}
          {listing.tags && listing.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {listing.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-md bg-panel px-2 py-1 text-[11px] font-medium text-muted"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Divider */}
          <hr className="border-border" />

          {/* Purchase CTA */}
          <PurchaseButton
            listingId={listing.id}
            priceCents={listing.price_cents}
            currency={listing.currency}
            isFree={listing.is_free}
            slug={slug}
          />

          {/* Price detail (for paid items) */}
          {!listing.is_free && listing.price_cents > 0 && (
            <div className="rounded-xl bg-surface p-4 text-center">
              <p className="text-2xl font-bold font-display text-fg">{priceText}</p>
              <p className="mt-1 text-xs text-muted">{t('detail.license')}</p>
            </div>
          )}
        </div>
      </div>

      {/* Related listings */}
      {related.length > 0 && (
        <div className="mt-16 border-t border-border pt-12">
          <RelatedListings listings={related} />
        </div>
      )}
    </div>
  );
}
