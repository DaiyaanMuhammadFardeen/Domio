'use client';

import Link from 'next/link';
import { useLocale } from '@/hooks/useLocale';
import type { ListingCardVM } from '@/lib/types';

interface ListingCardProps {
  listing: ListingCardVM;
}

const KIND_LABELS: Record<string, string> = {
  component: 'Component',
  template: 'Template',
  theme: 'Theme',
  sticker_pack: 'Sticker Pack',
  icon_pack: 'Icon Pack',
};

const KIND_COLORS: Record<string, string> = {
  component: 'bg-accent/12 text-accent',
  template: 'bg-emerald-500/12 text-emerald-400',
  theme: 'bg-purple-500/12 text-purple-400',
  sticker_pack: 'bg-amber-500/12 text-amber-400',
  icon_pack: 'bg-rose-500/12 text-rose-400',
};

function StarIcon({ filled }: { filled: boolean; }) {
  return (
    <svg
      className={`h-3.5 w-3.5 ${filled ? 'text-gold' : 'text-border'}`}
      fill="currentColor"
      viewBox="0 0 20 20"
      aria-hidden="true"
    >
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  );
}

function renderStars(rating: number) {
  const full = Math.floor(rating);
  return Array.from({ length: 5 }, (_, i) => i).map((i) => (
    <StarIcon key={`star-${i}`} filled={i < full} />
  ));
}

export function ListingCard({ listing }: ListingCardProps) {
  const { formatPrice } = useLocale();

  const priceText = formatPrice(listing.price_cents, listing.currency, listing.is_free);
  const kindLabel = KIND_LABELS[listing.kind] ?? listing.kind;
  const kindColor = KIND_COLORS[listing.kind] ?? 'bg-panel text-muted';

  return (
    <Link
      href={`/listing/${listing.slug}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-panel transition-all duration-200 hover:border-accent/30 hover:shadow-lg hover:shadow-accent/5 hover:-translate-y-0.5"
      aria-label={`${listing.title} — ${priceText}`}
    >
      {/* Thumbnail placeholder */}
      <div className="relative aspect-[4/3] overflow-hidden bg-surface">
        {listing.poster_url ? (
          <img
            src={listing.poster_url}
            alt=""
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <svg className="h-12 w-12 text-border" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}

        {/* Kind badge */}
        <span className={`absolute left-3 top-3 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${kindColor}`}>
          {kindLabel}
        </span>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-2 font-display text-sm font-semibold leading-snug text-fg transition-colors group-hover:text-accent">
          {listing.title}
        </h3>

        <p className="text-xs text-muted">
          {listing.creator_name}
        </p>

        {/* Bottom row — rating + price */}
        <div className="mt-auto flex items-center justify-between pt-2">
          <div className="flex items-center gap-1.5" aria-label={`${listing.rating_avg.toFixed(1)} stars, ${listing.rating_count} reviews`}>
            <div className="flex gap-0.5">{renderStars(listing.rating_avg)}</div>
            <span className="text-[11px] text-muted">
              ({listing.rating_count})
            </span>
          </div>

          <span className={`text-sm font-semibold ${listing.is_free ? 'text-success' : 'text-fg'}`}>
            {priceText}
          </span>
        </div>
      </div>
    </Link>
  );
}
