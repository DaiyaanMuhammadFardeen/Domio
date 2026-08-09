'use client';

import { useEffect, useState } from 'react';
import { Calendar } from 'lucide-react';
import { KpiTile } from '../../components/KpiTile';
import { useI18n } from '../../lib/i18n';
import type { CreatorAnalytics } from '../../lib/types';
import { fetcher } from '../../lib/fetcher';

const API_BASE = process.env['NEXT_PUBLIC_API_BASE'] ?? 'http://localhost:8080';

function formatCurrency(cents: number, currency: string = 'USD'): string {
  const amount = cents / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

export default function AnalyticsPage() {
  const { t } = useI18n();
  const [analytics, setAnalytics] = useState<CreatorAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const data = await fetcher<CreatorAnalytics>(
          API_BASE,
          `/v1/creator/analytics?period=${period}`,
        );
        setAnalytics(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load analytics');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [period]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm text-slate-500">Loading analytics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-6">
        <h3 className="text-sm font-semibold text-rose-800">Error loading analytics</h3>
        <p className="mt-1 text-sm text-rose-700">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('analytics.title')}</h1>
          <p className="mt-1 text-sm text-slate-500">
            Track your marketplace performance and revenue.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-slate-400" />
          <input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiTile
          title={t('analytics.downloads')}
          value={analytics?.downloads.toLocaleString() ?? '0'}
          tone="brand"
        />
        <KpiTile
          title={t('analytics.installs')}
          value={analytics?.installs.toLocaleString() ?? '0'}
          tone="brand"
        />
        <KpiTile
          title={t('analytics.mrr')}
          value={analytics ? formatCurrency(analytics.mrr_cents) : '$0'}
          tone="success"
        />
        <KpiTile
          title={t('analytics.conversion')}
          value={analytics ? formatRate(analytics.conversion_rate) : '0%'}
          tone="brand"
        />
        <KpiTile
          title={t('analytics.refundRate')}
          value={analytics ? formatRate(analytics.refund_rate) : '0%'}
          tone={analytics && analytics.refund_rate > 0.1 ? 'warning' : 'success'}
        />
      </div>

      {/* Additional Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {t('analytics.listings')}
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
            {analytics?.listings ?? 0}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {t('analytics.avgRating')}
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
            {analytics?.avg_rating ? analytics.avg_rating.toFixed(1) : '—'}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Period
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
            {period}
          </div>
        </div>
      </div>

      {/* Top Geographies */}
      {analytics && analytics.top_geos.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">{t('analytics.topGeos')}</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {analytics.top_geos.map((geo) => (
              <div
                key={geo.country_code}
                className="flex items-center justify-between px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">{getCountryFlag(geo.country_code)}</span>
                  <span className="text-sm font-medium text-slate-900">{geo.country_code}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm tabular-nums text-slate-700">
                    {geo.installs.toLocaleString()} installs
                  </span>
                  <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full bg-brand-500"
                      style={{
                        width: `${(geo.installs / Math.max(...analytics.top_geos.map((g) => g.installs))) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function getCountryFlag(code: string): string {
  const flags: Record<string, string> = {
    US: '🇺🇸',
    GB: '🇬🇧',
    DE: '🇩🇪',
    FR: '🇫🇷',
    JP: '🇯🇵',
    BD: '🇧🇩',
    IN: '🇮🇳',
    BR: '🇧🇷',
    CA: '🇨🇦',
    AU: '🇦🇺',
  };
  return flags[code] ?? '🌍';
}
