'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle, XCircle, Trash2, Upload } from 'lucide-react';
import { SortableTable, type SortableColumn } from '../../components/SortableTable';
import { Badge, toneForBrandLock } from '../../components/Badge';
import { fetcher } from '../../lib/fetcher';
import type { BrandLock, MarketplaceListing, BrandLockState } from '../../lib/types';

type Row = Record<string, unknown> & {
  id: string;
  listing_id: string;
  title: string;
  seller_id: string;
  state: BrandLockState | 'none';
  override_price_cents: number | null;
  lock_id: string | null;
  notes: string | null;
};

function formatCents(cents: number | null): string {
  if (cents === null) return '—';
  return `$${(cents / 100).toFixed(2)}`;
}

export default function BrandLocksPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [brandKitFilter, setBrandKitFilter] = useState('');
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  // CSV import state
  const fileRef = useRef<HTMLInputElement>(null);
  const [csvPreview, setCsvPreview] = useState<string[] | null>(null);

  const loadData = useCallback(async (brandKitId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = brandKitId ? `?brand_kit_id=${encodeURIComponent(brandKitId)}` : '';
      const [locksRes, listingsRes] = await Promise.all([
        fetcher<{ items: BrandLock[]; total: number }>(`/v1/marketplace/brand-locks${params}`),
        fetcher<{ items: MarketplaceListing[]; total: number }>('/v1/marketplace/listings?status=published'),
      ]);

      const lockMap = new Map<string, BrandLock>();
      for (const lock of locksRes.items) {
        lockMap.set(lock.marketplace_listing_id, lock);
      }

      const merged: Row[] = listingsRes.items.map((listing) => {
        const lock = lockMap.get(listing.id);
        return {
          id: listing.id,
          listing_id: listing.id,
          title: listing.title,
          seller_id: listing.seller_id,
          state: lock?.state ?? 'none',
          override_price_cents: lock?.override_price_cents ?? null,
          lock_id: lock?.id ?? null,
          notes: lock?.notes ?? null,
        };
      });
      setRows(merged);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(brandKitFilter || undefined);
  }, [brandKitFilter, loadData]);

  async function handleApprove(row: Row) {
    if (!row.lock_id) {
      setActionBusy(row.id);
      try {
        await fetcher('/v1/marketplace/brand-locks', {
          method: 'POST',
          body: {
            tenant_id: 'admin',
            brand_kit_id: brandKitFilter || 'default',
            marketplace_listing_id: row.listing_id,
            state: 'allow',
          },
        });
        await loadData(brandKitFilter || undefined);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to approve');
      } finally {
        setActionBusy(null);
      }
    }
  }

  async function handleDeny(row: Row) {
    setActionBusy(row.id);
    try {
      if (row.lock_id) {
        // Delete existing lock, then create deny lock
        await fetcher(`/v1/marketplace/brand-locks/${row.lock_id}`, { method: 'DELETE' });
      }
      await fetcher('/v1/marketplace/brand-locks', {
        method: 'POST',
        body: {
          tenant_id: 'admin',
          brand_kit_id: brandKitFilter || 'default',
          marketplace_listing_id: row.listing_id,
          state: 'deny',
        },
      });
      await loadData(brandKitFilter || undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to deny');
    } finally {
      setActionBusy(null);
    }
  }

  async function handleOverride(row: Row) {
    const priceStr = window.prompt('Override price in cents (e.g. 1299 for $12.99):');
    if (priceStr === null) return;
    const price = parseInt(priceStr, 10);
    if (isNaN(price) || price < 0) {
      setError('Invalid price. Must be a non-negative integer (cents).');
      return;
    }
    setActionBusy(row.id);
    try {
      if (row.lock_id) {
        await fetcher(`/v1/marketplace/brand-locks/${row.lock_id}`, { method: 'DELETE' });
      }
      await fetcher('/v1/marketplace/brand-locks', {
        method: 'POST',
        body: {
          tenant_id: 'admin',
          brand_kit_id: brandKitFilter || 'default',
          marketplace_listing_id: row.listing_id,
          state: 'override',
          override_price_cents: price,
        },
      });
      await loadData(brandKitFilter || undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to set override');
    } finally {
      setActionBusy(null);
    }
  }

  async function handleRemove(row: Row) {
    if (!row.lock_id) return;
    if (!window.confirm(`Remove brand lock for "${row.title}"?`)) return;
    setActionBusy(row.id);
    try {
      await fetcher(`/v1/marketplace/brand-locks/${row.lock_id}`, { method: 'DELETE' });
      await loadData(brandKitFilter || undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove');
    } finally {
      setActionBusy(null);
    }
  }

  function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result);
      const lines = text.split('\n').filter((l) => l.trim()).slice(0, 10);
      setCsvPreview(lines);
    };
    reader.readAsText(file);
  }

  const columns: ReadonlyArray<SortableColumn<Row>> = [
    { key: 'title', header: 'Listing', type: 'string' },
    { key: 'seller_id', header: 'Seller', type: 'string' },
    {
      key: 'state',
      header: 'Brand Lock',
      type: 'string',
      format: (val) => {
        const state = String(val);
        if (state === 'none') return <Badge tone="grey">none</Badge>;
        return <Badge tone={toneForBrandLock(state)}>{state}</Badge>;
      },
    },
    {
      key: 'override_price_cents',
      header: 'Override Price',
      type: 'number',
      align: 'right',
      format: (val) => formatCents(val as number | null),
    },
    {
      key: 'id',
      header: 'Actions',
      type: 'string',
      format: (_val, row) => {
        const busy = actionBusy === row.id;
        return (
          <div className="flex items-center gap-1">
            {row.state !== 'allow' && (
              <button
                type="button"
                disabled={busy}
                onClick={() => handleApprove(row)}
                className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
                aria-label={`Approve ${row.title}`}
              >
                <CheckCircle className="h-3 w-3" aria-hidden />
                Allow
              </button>
            )}
            {row.state !== 'deny' && (
              <button
                type="button"
                disabled={busy}
                onClick={() => handleDeny(row)}
                className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
                aria-label={`Deny ${row.title}`}
              >
                <XCircle className="h-3 w-3" aria-hidden />
                Deny
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => handleOverride(row)}
              className="rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 transition hover:bg-amber-100 disabled:opacity-50"
              aria-label={`Set override price for ${row.title}`}
            >
              Override
            </button>
            {row.lock_id && (
              <button
                type="button"
                disabled={busy}
                onClick={() => handleRemove(row)}
                className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
                aria-label={`Remove lock for ${row.title}`}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Brand-Lock Curation
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Control which listings are visible to each brand kit. A <strong>deny</strong> lock overrides visibility entirely.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-xs font-medium text-slate-600" htmlFor="brand-kit-filter">
            Brand Kit ID
          </label>
          <input
            id="brand-kit-filter"
            type="text"
            value={brandKitFilter}
            onChange={(e) => setBrandKitFilter(e.target.value)}
            placeholder="e.g. bk-acme"
            className="w-40 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm transition focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <Upload className="h-3.5 w-3.5" aria-hidden />
            Import CSV
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            onChange={handleCsvUpload}
            className="hidden"
            aria-label="Upload CSV file for bulk brand-lock import"
          />
        </div>
      </div>

      {csvPreview && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-amber-800">CSV Preview (first {csvPreview.length} rows)</span>
            <button
              type="button"
              onClick={() => setCsvPreview(null)}
              className="text-xs text-amber-600 hover:text-amber-800"
            >
              Dismiss
            </button>
          </div>
          <pre className="overflow-x-auto text-xs text-amber-900">{csvPreview.join('\n')}</pre>
          <p className="mt-2 text-xs text-amber-600 italic">
            Bulk import backend endpoint is deferred. This preview shows parsed rows for verification.
          </p>
        </div>
      )}

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
          emptyMessage="No published listings found. Publish listings to manage brand locks."
        />
      )}
    </div>
  );
}
