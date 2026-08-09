'use client';

import { useLocale } from '@/hooks/useLocale';
import type { ListingCardVM } from '@/lib/types';
import { ListingCard } from './ListingCard';

interface RelatedListingsProps {
  listings: ListingCardVM[];
}

export function RelatedListings({ listings }: RelatedListingsProps) {
  const { t } = useLocale();

  if (listings.length === 0) return null;

  return (
    <section aria-labelledby="related-heading">
      <h3
        id="related-heading"
        className="mb-6 font-display text-base font-semibold text-fg"
      >
        {t('detail.related')}
      </h3>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {listings.map((item) => (
          <ListingCard key={item.id} listing={item} />
        ))}
      </div>
    </section>
  );
}
