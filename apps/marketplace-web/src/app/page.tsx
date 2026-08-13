'use client';

import { useEffect, useState } from 'react';
import { useLocale } from '@/hooks/useLocale';
import { ListingCard } from '@/components/ListingCard';
import {
  getFeatured,
  getTopRated,
  getRecentlyAdded,
  getByCategory,
  toCardVM,
} from '@/lib/search-service';
import type { ListingKind, MarketplaceListingWithMeta } from '@/lib/types';

type CategoryGroups = Record<ListingKind, MarketplaceListingWithMeta[]>;

const KIND_LABEL_KEY: Record<ListingKind, string> = {
  component: 'market.home.featured',
  template: 'market.home.featured',
  theme: 'market.home.featured',
  sticker_pack: 'market.home.featured',
  icon_pack: 'market.home.featured',
};

export default function HomePage() {
  const { t } = useLocale();
  const [featured, setFeatured] = useState<MarketplaceListingWithMeta[]>([]);
  const [topRated, setTopRated] = useState<MarketplaceListingWithMeta[]>([]);
  const [recent, setRecent] = useState<MarketplaceListingWithMeta[]>([]);
  const [groups, setGroups] = useState<CategoryGroups | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [f, tr, ra, bg] = await Promise.all([
        getFeatured(),
        getTopRated(),
        getRecentlyAdded(),
        getByCategory(),
      ]);
      if (cancelled) return;
      setFeatured(f);
      setTopRated(tr);
      setRecent(ra);
      setGroups(bg);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8" data-testid="home-page">
        <p className="text-sm text-muted">Loading…</p>
      </div>
    );
  }

  const categories: ReadonlyArray<{ kind: ListingKind; items: MarketplaceListingWithMeta[] }> =
    groups
      ? (Object.entries(groups) as [ListingKind, MarketplaceListingWithMeta[]][])
          .filter(([, items]) => items.length > 0)
          .map(([kind, items]) => ({ kind, items }))
      : [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8" data-testid="home-page">
      <Hero />

      <Section id="home-section-featured" title={t('market.home.featured')} items={featured} />

      <Section id="home-section-top-rated" title={t('market.home.topRated')} items={topRated} />

      <Section id="home-section-recent" title={t('market.home.recentlyAdded')} items={recent} />

      <section className="mt-12" data-testid="home-section-category">
        <h2 className="mb-6 font-display text-2xl font-bold text-fg">
          {t('market.home.byCategory')}
        </h2>
        <div className="space-y-12">
          {categories.map(({ kind, items }) => (
            <div key={kind} data-testid={`home-section-category-${kind}`} className="space-y-4">
              <h3 className="font-display text-base font-semibold uppercase tracking-wider text-muted">
                {KIND_LABEL_KEY[kind] ? t('market.home.featured') : kind}
                {' · '}
                {kind.replace('_', ' ')}
              </h3>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {items.map((l) => (
                  <ListingCard key={l.id} listing={toCardVM(l)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Hero() {
  const { t } = useLocale();
  return (
    <section className="mb-12 py-8 text-center sm:py-12">
      <h1 className="font-display text-3xl font-bold tracking-tight text-fg text-balance sm:text-4xl lg:text-5xl">
        {t('hero.title')}
      </h1>
      <p className="mx-auto mt-4 max-w-xl text-base text-muted sm:text-lg">{t('hero.subtitle')}</p>
    </section>
  );
}

interface SectionProps {
  id: string;
  title: string;
  items: ReadonlyArray<MarketplaceListingWithMeta>;
}

function Section({ id, title, items }: SectionProps) {
  if (items.length === 0) return null;
  return (
    <section className="mt-12" data-testid={id}>
      <h2 className="mb-6 font-display text-2xl font-bold text-fg">{title}</h2>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        {items.map((l) => (
          <ListingCard key={l.id} listing={toCardVM(l)} />
        ))}
      </div>
    </section>
  );
}
