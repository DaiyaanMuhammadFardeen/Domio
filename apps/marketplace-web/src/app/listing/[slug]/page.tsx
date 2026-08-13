'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale } from '@/hooks/useLocale';
import {
  getMarketplaceListing,
  listMarketplaceReviews,
  getMarketplaceListingChangelog,
} from '@/lib/api';
import { marketplaceWeb } from '@domio/ui/routing';
import { getRelatedListings } from '@/lib/search-service';
import type {
  MarketplaceListing,
  Review,
  ChangelogEntry,
  ListingKind,
  ListingCardVM,
} from '@/lib/types';
import { ReviewsList } from '@/components/ReviewsList';
import { ChangelogTimeline } from '@/components/ChangelogTimeline';
import { ListingCard } from '@/components/ListingCard';
import { ListingDetailSkeleton } from '@/components/LoadingSkeletons';
import { NotFoundState, ErrorState } from '@/components/EmptyState';

interface ListingPageProps {
  params: Promise<{ slug: string }>;
}

const KIND_TAG: Record<string, string> = {
  component: 'Component',
  template: 'Template',
  theme: 'Theme',
  sticker_pack: 'Sticker Pack',
  icon_pack: 'Icon Pack',
};

export default function ListingPage({ params }: ListingPageProps) {
  const { slug } = use(params);
  const router = useRouter();
  const { t, formatPrice } = useLocale();

  const [listing, setListing] = useState<MarketplaceListing | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewsTotal, setReviewsTotal] = useState(0);
  const [changelog, setChangelog] = useState<ChangelogEntry[]>([]);
  const [related, setRelated] = useState<ListingCardVM[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      setLoading(true);
      setError(false);
      setNotFound(false);
      try {
        const data = await getMarketplaceListing(slug);
        if (cancelled) return;
        setListing(data);
        const [rv, cl, rl] = await Promise.allSettled([
          listMarketplaceReviews(data.id),
          getMarketplaceListingChangelog(data.id),
          getRelatedListings(data.id),
        ]);
        if (cancelled) return;
        if (rv.status === 'fulfilled') {
          setReviews(rv.value.items);
          setReviewsTotal(rv.value.total);
        }
        if (cl.status === 'fulfilled') setChangelog(cl.value);
        if (rl.status === 'fulfilled') setRelated([...rl.value]);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void fetchData();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (loading) return <ListingDetailSkeleton />;

  if (error) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-12">
        <ErrorState onRetry={() => window.location.reload()} />
      </div>
    );
  }

  if (notFound || !listing) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-12">
        <NotFoundState />
        <div className="mt-6 text-center">
          <Link href={marketplaceWeb('home')} className="text-sm text-accent hover:underline">
            {t('detail.backToBrowse')}
          </Link>
        </div>
      </div>
    );
  }

  const priceText = formatPrice(listing.price_cents, listing.currency, listing.is_free);
  const kind: ListingKind =
    (listing.tags?.find(
      (tag) =>
        tag === 'component' ||
        tag === 'template' ||
        tag === 'theme' ||
        tag === 'sticker_pack' ||
        tag === 'icon_pack',
    ) as ListingKind) ?? 'component';

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8" data-testid="listing-page">
      <nav className="mb-8" aria-label="Breadcrumb">
        <Link
          href={marketplaceWeb('home')}
          className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-fg"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          {t('detail.backToBrowse')}
        </Link>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[1.1fr,1.4fr,360px]">
        {/* Left: poster + gallery + video */}
        <div className="space-y-4" data-testid="listing-preview">
          <div className="aspect-square overflow-hidden rounded-2xl border border-border bg-surface">
            {listing.preview?.poster_ref ? (
              <img
                src={listing.preview.poster_ref}
                alt={listing.title}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <span className="font-display text-3xl font-bold text-muted">
                  {listing.title.slice(0, 2).toUpperCase()}
                </span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="aspect-square rounded-lg border border-border bg-surface"
                aria-hidden="true"
              />
            ))}
          </div>

          <div className="aspect-video rounded-2xl border border-border bg-surface flex items-center justify-center">
            <span className="text-xs text-muted">▶ Video preview</span>
          </div>
        </div>

        {/* Middle: title, description, tags, changelog, reviews */}
        <div className="space-y-8">
          <div>
            <span className="mb-2 inline-block rounded-md bg-panel px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
              {KIND_TAG[kind] ?? kind}
            </span>
            <h1 className="font-display text-3xl font-bold text-fg" data-testid="listing-title">
              {listing.title}
            </h1>
            <p className="mt-2 text-sm text-muted">
              {t('market.listing.published')}{' '}
              {listing.published_at_ms
                ? new Date(listing.published_at_ms).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })
                : '—'}
            </p>
          </div>

          {listing.description && (
            <section>
              <p className="text-sm leading-relaxed text-fg/80">{listing.description}</p>
            </section>
          )}

          {listing.tags && listing.tags.length > 0 && (
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                Tags
              </h2>
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
            </section>
          )}

          <section data-testid="listing-changelog">
            <ChangelogTimeline entries={changelog} />
          </section>

          <section data-testid="listing-reviews">
            <ReviewsList reviews={reviews} total={reviewsTotal} />
          </section>
        </div>

        {/* Right: pricing card */}
        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl border border-border bg-panel p-6">
            <div className="mb-4">
              <p className="text-xs uppercase tracking-wider text-muted">
                {t('market.listing.version')} {listing.version}
              </p>
              <p
                className={`mt-2 font-display text-3xl font-bold ${
                  listing.is_free ? 'text-success' : 'text-fg'
                }`}
                data-testid="listing-price"
              >
                {priceText}
              </p>
            </div>

            {listing.is_free ? (
              <button
                type="button"
                data-testid="listing-cta"
                onClick={() => router.push(marketplaceWeb('library'))}
                className="w-full rounded-xl bg-accent py-3.5 text-sm font-semibold text-white transition-all hover:opacity-90"
              >
                {t('market.listing.addToLibrary')}
              </button>
            ) : (
              <button
                type="button"
                data-testid="listing-cta"
                onClick={() => router.push(marketplaceWeb('checkout', { listing: listing.id }))}
                className="w-full rounded-xl bg-accent py-3.5 text-sm font-semibold text-white transition-all hover:opacity-90"
              >
                {t('market.listing.buyNow')}
              </button>
            )}

            <p className="mt-3 text-center text-[11px] text-muted">
              {t('market.listing.installed')}
            </p>
          </div>
        </aside>
      </div>

      {related.length > 0 && (
        <section className="mt-16 border-t border-border pt-12" data-testid="listing-related">
          <h2 className="mb-6 font-display text-2xl font-bold text-fg">
            {t('market.listing.related')}
          </h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
