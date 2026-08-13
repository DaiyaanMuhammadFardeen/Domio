'use client';

import { useEffect, useMemo, useState } from 'react';
import { KpiTile } from '../../components/KpiTile';
import { ConversionFunnel } from '../../components/analytics/ConversionFunnel';
import { GeoDistribution } from '../../components/analytics/GeoDistribution';
import { PeriodPicker } from '../../components/analytics/PeriodPicker';
import { RevenueChart } from '../../components/analytics/RevenueChart';
import { TopListingsTable } from '../../components/analytics/TopListingsTable';
import { useI18n } from '../../lib/i18n';
import {
  bucketForPeriod,
  formatRevenueCents,
  getConversionFunnel,
  getGeoDistribution,
  getRevenueSeries,
  getTopListings,
} from '../../lib/analytics-service';
import type {
  AnalyticsPeriod,
  ConversionFunnel as ConversionFunnelData,
  GeoBucket,
  RevenuePoint,
  TopListing,
} from '../../lib/types';

const CREATOR_ID = 'creator-demo';

function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

export default function AnalyticsPage() {
  const { t } = useI18n();
  const [period, setPeriod] = useState<AnalyticsPeriod>('30d');
  const [revenue, setRevenue] = useState<ReadonlyArray<RevenuePoint>>([]);
  const [topListings, setTopListings] = useState<ReadonlyArray<TopListing>>([]);
  const [geo, setGeo] = useState<ReadonlyArray<GeoBucket>>([]);
  const [funnel, setFunnel] = useState<ConversionFunnelData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const bucket = bucketForPeriod(period);
    setLoading(true);
    Promise.all([
      getRevenueSeries(CREATOR_ID, period, bucket),
      getTopListings(CREATOR_ID, period),
      getGeoDistribution(CREATOR_ID, period),
      getConversionFunnel(CREATOR_ID, period),
    ])
      .then(([series, listings, geos, fn]) => {
        if (cancelled) return;
        setRevenue(series);
        setTopListings(listings);
        setGeo(geos);
        setFunnel(fn);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [period]);

  const totalRevenueCents = useMemo(
    () => revenue.reduce((sum, p) => sum + p.revenue_cents, 0),
    [revenue],
  );
  const totalInstalls = useMemo(() => geo.reduce((sum, g) => sum + g.installs, 0), [geo]);
  const totalUnits = useMemo(
    () => topListings.reduce((sum, l) => sum + l.units_sold, 0),
    [topListings],
  );
  // Avg rating: synthetic — 4.2 .. 4.8 based on top-listing performance.
  const avgRating = useMemo(() => {
    if (topListings.length === 0) return 0;
    const meanConv = topListings.reduce((s, l) => s + l.conversion_rate, 0) / topListings.length;
    return Math.min(4.9, 4.0 + meanConv * 8).toFixed(1);
  }, [topListings]);

  return (
    <div data-testid="analytics-page" className="space-y-6">
      {/* Header row: title + period picker */}
      <div
        data-testid="analytics-row-header"
        className="flex flex-wrap items-end justify-between gap-3"
      >
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t('creator.analytics.heading')}
          </h1>
          <p className="mt-1 text-sm text-slate-500">{t('creator.analytics.subheading')}</p>
        </div>
        <PeriodPicker period={period} onChange={setPeriod} />
      </div>

      {/* KPI tiles */}
      <div data-testid="analytics-row-kpis" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile title="Revenue" value={formatRevenueCents(totalRevenueCents)} tone="success" />
        <KpiTile title="Installs" value={totalInstalls.toLocaleString()} tone="brand" />
        <KpiTile
          title="Conversion"
          value={funnel ? formatRate(funnel.overall_conversion_rate) : '—'}
          tone="brand"
        />
        <KpiTile title="Avg rating" value={avgRating || '—'} tone="brand" />
      </div>

      {/* Revenue chart */}
      <section
        data-testid="analytics-row-revenue"
        className="rounded-xl border border-slate-200 bg-white p-4"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">
            {t('creator.analytics.revenue.heading')}
          </h2>
          <span className="text-xs text-slate-500">
            {totalUnits.toLocaleString()} units · refund overlay in{' '}
            <span className="font-medium text-rose-600">
              {t('creator.analytics.revenue.refunds')}
            </span>
          </span>
        </div>
        {loading && revenue.length === 0 ? (
          <div className="flex h-60 items-center justify-center text-sm text-slate-500">
            Loading…
          </div>
        ) : (
          <RevenueChart points={revenue} />
        )}
      </section>

      {/* Top listings + conversion funnel */}
      <div data-testid="analytics-row-listings-funnel" className="grid gap-4 lg:grid-cols-2">
        <section
          data-testid="analytics-top-listings"
          className="rounded-xl border border-slate-200 bg-white p-4"
        >
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-slate-900">
              {t('creator.analytics.topListings.heading')}
            </h2>
          </div>
          <TopListingsTable listings={topListings} />
        </section>
        <section
          data-testid="analytics-conversion-funnel"
          className="rounded-xl border border-slate-200 bg-white p-4"
        >
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-slate-900">
              {t('creator.analytics.funnel.heading')}
            </h2>
          </div>
          {funnel ? <ConversionFunnel funnel={funnel} /> : null}
        </section>
      </div>

      {/* Geo distribution */}
      <section
        data-testid="analytics-row-geo"
        className="rounded-xl border border-slate-200 bg-white p-4"
      >
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-slate-900">
            {t('creator.analytics.geo.heading')}
          </h2>
        </div>
        <GeoDistribution buckets={geo} />
      </section>
    </div>
  );
}
