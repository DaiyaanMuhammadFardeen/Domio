'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Search } from 'lucide-react';
import { Badge, toneForListingStatus } from '../../components/Badge';
import { useI18n } from '../../lib/i18n';
import type { MarketplaceListing } from '../../lib/types';
import { fetcher } from '../../lib/fetcher';
import { creatorConsole } from '@domio/ui/routing';

const API_BASE = process.env['NEXT_PUBLIC_API_BASE'] ?? 'http://localhost:8080';

const KIND_LABELS: Record<string, string> = {
  component: 'Component',
  template: 'Template',
  theme: 'Theme',
  sticker_pack: 'Sticker Pack',
  icon_pack: 'Icon Pack',
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  in_review: 'In Review',
  published: 'Published',
  deprecated: 'Deprecated',
  removed: 'Removed',
};

function formatPrice(listing: MarketplaceListing): string {
  if (listing.is_free || listing.price_cents === 0) return 'Free';
  const amount = listing.price_cents / 100;
  return `${listing.currency} ${amount.toFixed(2)}`;
}

export default function ListingsPage() {
  const { t } = useI18n();
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const data = await fetcher<{ items: MarketplaceListing[] }>(
          API_BASE,
          '/v1/marketplace/listings',
        );
        setListings(data.items);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load listings');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filtered = listings.filter(
    (l) =>
      l.title.toLowerCase().includes(search.toLowerCase()) ||
      l.tags.some((tag) => tag.toLowerCase().includes(search.toLowerCase())),
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm text-slate-500">Loading listings...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-6">
        <h3 className="text-sm font-semibold text-rose-800">Error loading listings</h3>
        <p className="mt-1 text-sm text-rose-700">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('listings.title')}</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage your marketplace listings and track performance.
          </p>
        </div>
        <Link
          href={creatorConsole('listings-create')}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          {t('listings.create')}
        </Link>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search listings..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
        />
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
          <div className="text-sm font-medium text-slate-900">{t('listings.empty')}</div>
          <p className="mt-1 text-sm text-slate-500">{t('listings.emptyHint')}</p>
          <Link
            href={creatorConsole('listings-create')}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            {t('listings.create')}
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th scope="col" className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                  {t('listings.table.title')}
                </th>
                <th scope="col" className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                  {t('listings.table.kind')}
                </th>
                <th scope="col" className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                  {t('listings.table.status')}
                </th>
                <th scope="col" className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">
                  {t('listings.table.price')}
                </th>
                <th scope="col" className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">
                  {t('listings.table.downloads')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((listing) => (
                <tr key={listing.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-3">
                    <Link
                      href={`/listings/${listing.id}`}
                      className="font-medium text-slate-900 hover:text-brand-600"
                    >
                      {listing.title}
                    </Link>
                    {listing.description && (
                      <p className="mt-0.5 text-xs text-slate-500 line-clamp-1">
                        {listing.description}
                      </p>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    {KIND_LABELS[listing.kind] ?? listing.kind}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <Badge tone={toneForListingStatus(listing.status)}>
                      {STATUS_LABELS[listing.status] ?? listing.status}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-800">
                    {formatPrice(listing)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-600">
                    —
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
