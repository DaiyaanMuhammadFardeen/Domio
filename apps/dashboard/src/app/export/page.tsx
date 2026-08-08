/**
 * /export — landing for the streaming export endpoint.
 *
 * Provides two download buttons (CSV + Parquet stub) that hit
 * `/api/export/[kind]`. The route handler streams from the warehouse
 * with backpressure (CSV) or returns a JSON stub (Parquet).
 */

import Link from 'next/link';

export default function ExportPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Export</h1>
        <p className="text-sm text-slate-500">
          Stream raw rows out of the warehouse
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link
          href="/api/export/csv"
          prefetch={false}
          className="rounded-xl border border-slate-200 bg-white p-5 hover:border-brand-300"
        >
          <div className="text-sm font-semibold text-slate-900">CSV stream</div>
          <p className="mt-1 text-sm text-slate-500">
            Newline-delimited JSON flattened to CSV with backpressure-aware streaming.
          </p>
        </Link>
        <Link
          href="/api/export/parquet"
          prefetch={false}
          className="rounded-xl border border-slate-200 bg-white p-5 hover:border-brand-300"
        >
          <div className="text-sm font-semibold text-slate-900">Parquet (stub)</div>
          <p className="mt-1 text-sm text-slate-500">
            Returns a JSON stub today. Wire up duckdb / parquetjs in Phase 18+.
          </p>
        </Link>
      </section>
    </div>
  );
}