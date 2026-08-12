'use client';

import { useCallback, useEffect, useState } from 'react';
import { Shield, ShieldAlert, ShieldCheck } from 'lucide-react';
import { SortableTable, type SortableColumn } from '../../components/SortableTable';
import { Badge, toneForListingStatus } from '../../components/Badge';
import { fetcher } from '../../lib/fetcher';
import type { MarketplaceListing } from '../../lib/types';

type Row = Record<string, unknown> & MarketplaceListing & {
  trust_score: number;
  auto_hidden: boolean;
};

/**
 * Derive a trust score from listing attributes.
 *
 * The current trust scoring algorithm is a deterministic heuristic
 * (0–100) computed from listing completeness and recency:
 *   - listing status (published = +20)
 *   - presence of description (+15)
 *   - presence of tags (+10)
 *   - price_cents > 0 implies paid listing (+15)
 *   - published_at_ms recency (+20 if < 90 days, +10 if < 365 days)
 *   - version set implies maintained (+10)
 *   - has preview media (+10)
 *
 * Listings scoring below 20 are auto-hidden from the marketplace.
 */
function deriveTrustScore(listing: MarketplaceListing): number {
  let score = 0;
  if (listing.status === 'published') score += 20;
  if (listing.description) score += 15;
  if (listing.tags.length > 0) score += 10;
  if (listing.price_cents > 0) score += 15;
  if (listing.version) score += 10;
  if (listing.preview?.poster_ref) score += 10;
  if (listing.published_at_ms) {
    const daysSince = (Date.now() - listing.published_at_ms) / (1000 * 60 * 60 * 24);
    if (daysSince < 90) score += 20;
    else if (daysSince < 365) score += 10;
  }
  return Math.min(score, 100);
}

function trustBadge(score: number): { tone: 'green' | 'amber' | 'red' | 'grey'; label: string } {
  if (score >= 70) return { tone: 'green', label: 'high' };
  if (score >= 40) return { tone: 'amber', label: 'medium' };
  if (score > 0) return { tone: 'red', label: 'low' };
  return { tone: 'grey', label: 'unscored' };
}

export default function TrustPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<Row | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetcher<{ items: MarketplaceListing[]; total: number }>(
        '/v1/marketplace/listings',
      );
      const scored: Row[] = res.items.map((listing) => {
        const trust_score = deriveTrustScore(listing);
        const auto_hidden = trust_score < 20 && listing.status === 'published';
        return { ...listing, trust_score, auto_hidden };
      });
      setRows(scored);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load listings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const columns: ReadonlyArray<SortableColumn<Row>> = [
    { key: 'title', header: 'Listing', type: 'string' },
    { key: 'seller_id', header: 'Seller', type: 'string' },
    {
      key: 'status',
      header: 'Status',
      type: 'string',
      format: (val) => <Badge tone={toneForListingStatus(String(val))}>{String(val)}</Badge>,
    },
    {
      key: 'trust_score',
      header: 'Trust Score',
      type: 'number',
      align: 'right',
      format: (val) => {
        const score = Number(val);
        const { tone, label } = trustBadge(score);
        return (
          <span className="inline-flex items-center gap-1.5">
            <span className="font-mono text-sm tabular-nums">{score}</span>
            <Badge tone={tone}>{label}</Badge>
          </span>
        );
      },
    },
    {
      key: 'auto_hidden',
      header: 'Auto-Hidden',
      type: 'string',
      format: (val) =>
        val ? (
          <span className="inline-flex items-center gap-1 text-rose-600">
            <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
            <span className="text-xs font-medium">Hidden</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-emerald-600">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
            <span className="text-xs font-medium">Visible</span>
          </span>
        ),
    },
    {
      key: 'price_cents',
      header: 'Price',
      type: 'number',
      align: 'right',
      format: (val) => {
        const cents = Number(val);
        if (cents === 0) return <span className="text-slate-500">Free</span>;
        return `$${(cents / 100).toFixed(2)}`;
      },
    },
    {
      key: 'id',
      header: 'Actions',
      type: 'string',
      format: (_val, row) => (
        <button
          type="button"
          className="text-xs font-medium text-brand-600 hover:text-brand-800"
          onClick={() => setReviewing(row)}
        >
          Review
        </button>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Trust Scoring
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Monitor listing trust scores. Scores are derived from listing completeness and recency.
          Listings scoring below 20 are auto-hidden from the marketplace.
        </p>
      </div>

      {loading && (
        <div className="space-y-2" aria-busy>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-200" />
          ))}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700" role="alert">
          <strong className="font-semibold">Error.</strong> {error}
        </div>
      )}

      {!loading && !error && (
        <SortableTable<Row>
          rows={rows}
          columns={columns}
          emptyMessage="No marketplace listings found."
        />
      )}

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-start gap-3">
          <Shield className="mt-0.5 h-5 w-5 text-slate-400" aria-hidden />
          <div>
            <h3 className="text-sm font-semibold text-slate-900">About Trust Scores</h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Trust scores are computed from listing completeness (description, tags, pricing, version history,
              preview media) and recency. A dedicated trust scoring API endpoint is planned for a future phase.
              Until then, this heuristic provides a reasonable signal for admin review triage.
            </p>
          </div>
        </div>
      </div>

      {reviewing ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="trust-review-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => setReviewing(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="trust-review-title" className="text-base font-semibold text-slate-900">
              {reviewing.title}
            </h2>
            <dl className="mt-4 space-y-2 text-sm text-slate-700">
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">Trust score</dt>
                <dd className="font-mono tabular-nums">{reviewing.trust_score}/100</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">Auto-hidden</dt>
                <dd>{reviewing.auto_hidden ? 'Yes' : 'No'}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">Status</dt>
                <dd className="capitalize">{reviewing.status}</dd>
              </div>
            </dl>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
                onClick={() => setReviewing(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
