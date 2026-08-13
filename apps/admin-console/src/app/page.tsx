'use client';

import { useEffect, useState } from 'react';
import { KpiTile } from '../components/KpiTile';
import { fetcher } from '../lib/fetcher';
import type { MarketplaceListing, TakedownRequest, BrandLock, PayoutRun } from '../lib/types';

interface OverviewStats {
  publishedListings: number;
  pendingTakedowns: number;
  deniedBrandLocks: number;
  totalPayoutRuns: number;
}

export default function OverviewPage() {
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ctrl = new AbortController();
    async function load() {
      try {
        const [listingsRes, takedownsRes, brandLocksRes, payoutRes] = await Promise.allSettled([
          fetcher<{ items: MarketplaceListing[]; total: number }>(
            '/v1/marketplace/listings?status=published',
            { signal: ctrl.signal },
          ),
          fetcher<{ items: TakedownRequest[]; total: number }>('/v1/takedowns?status=received', {
            signal: ctrl.signal,
          }),
          fetcher<{ items: BrandLock[]; total: number }>('/v1/marketplace/brand-locks', {
            signal: ctrl.signal,
          }),
          fetcher<PayoutRun[]>('/v1/payouts', { signal: ctrl.signal }),
        ]);

        const publishedListings = listingsRes.status === 'fulfilled' ? listingsRes.value.total : 0;
        const pendingTakedowns = takedownsRes.status === 'fulfilled' ? takedownsRes.value.total : 0;
        const deniedBrandLocks =
          brandLocksRes.status === 'fulfilled'
            ? brandLocksRes.value.items.filter((b) => b.state === 'deny').length
            : 0;
        const totalPayoutRuns = payoutRes.status === 'fulfilled' ? payoutRes.value.length : 0;

        setStats({ publishedListings, pendingTakedowns, deniedBrandLocks, totalPayoutRuns });
      } catch (e) {
        if (!ctrl.signal.aborted) {
          setError(e instanceof Error ? e.message : 'Failed to load overview');
        }
      } finally {
        setLoading(false);
      }
    }
    load();
    return () => ctrl.abort();
  }, []);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight text-slate-900">Admin Overview</h1>
      <p className="mb-6 text-sm text-slate-500">
        Real-time snapshot of marketplace health. Numbers are computed client-side from live API
        endpoints.
      </p>

      {loading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-busy>
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="animate-pulse rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="h-3 w-20 rounded bg-slate-200" />
              <div className="mt-2 h-7 w-16 rounded bg-slate-200" />
            </div>
          ))}
        </div>
      )}

      {error && (
        <div
          className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
          role="alert"
        >
          <strong className="font-semibold">Could not load overview.</strong> {error}
        </div>
      )}

      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiTile
            title="Published Listings"
            value={String(stats.publishedListings)}
            tone="success"
          />
          <KpiTile
            title="Pending Takedowns"
            value={String(stats.pendingTakedowns)}
            tone={stats.pendingTakedowns > 0 ? 'danger' : 'muted'}
          />
          <KpiTile
            title="Denied Brand Locks"
            value={String(stats.deniedBrandLocks)}
            tone={stats.deniedBrandLocks > 0 ? 'warning' : 'muted'}
          />
          <KpiTile title="Payout Runs" value={String(stats.totalPayoutRuns)} tone="brand" />
        </div>
      )}

      <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Quick Navigation
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              href: '/brand-locks',
              label: 'Brand-Lock Curation',
              desc: 'Approve, deny, or override brand locks for marketplace listings.',
            },
            {
              href: '/takedowns',
              label: 'Takedown Queue',
              desc: 'Review and resolve DMCA, trademark, and policy takedown requests.',
            },
            {
              href: '/trust',
              label: 'Trust Scoring',
              desc: 'Monitor listing trust scores and auto-hidden flags.',
            },
            {
              href: '/payouts',
              label: 'Payout Policy',
              desc: 'View payout splits, minimum thresholds, and run history.',
            },
          ].map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="group rounded-lg border border-slate-200 p-4 transition hover:border-brand-300 hover:shadow-md"
            >
              <div className="text-sm font-semibold text-slate-900 group-hover:text-brand-700">
                {item.label}
              </div>
              <div className="mt-1 text-xs text-slate-500">{item.desc}</div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
