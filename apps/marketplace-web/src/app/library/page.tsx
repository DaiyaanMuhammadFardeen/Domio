'use client';

import { useEffect, useState } from 'react';
import { useLocale } from '@/hooks/useLocale';
import { getMyLibrary } from '@/lib/library-service';
import type { LibraryEntry } from '@/lib/types';

function formatDate(ms: number | null): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function LibraryPage() {
  const { t } = useLocale();
  const [entries, setEntries] = useState<ReadonlyArray<LibraryEntry>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const list = await getMyLibrary('buyer_self');
      if (!cancelled) {
        setEntries(list);
        setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8" data-testid="library-page">
        <p className="text-sm text-muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8" data-testid="library-page">
      <h1 className="mb-8 font-display text-3xl font-bold text-fg">
        {t('market.library.heading')}
      </h1>

      <div className="overflow-hidden rounded-2xl border border-border bg-panel">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-wider text-muted">
              <th className="px-4 py-3 font-semibold">Title</th>
              <th className="px-4 py-3 font-semibold">Installed</th>
              <th className="px-4 py-3 font-semibold">Latest</th>
              <th className="px-4 py-3 font-semibold">License</th>
              <th className="px-4 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr
                key={entry.listing_id}
                data-testid={`library-row-${entry.listing_id}`}
                className="border-b border-border/40 last:border-0"
              >
                <td className="px-4 py-3">
                  <p className="font-medium text-fg">{entry.title}</p>
                  <p className="text-xs text-muted">v{entry.version}</p>
                  {entry.update_available && (
                    <span
                      data-testid={`library-update-badge-${entry.listing_id}`}
                      className="mt-1 inline-block rounded bg-accent/12 px-1.5 py-0.5 text-[10px] font-medium text-accent"
                    >
                      {t('market.library.updateAvailable')}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-muted">
                  {formatDate(entry.installed_at_ms)}
                </td>
                <td className="px-4 py-3 text-xs text-muted">v{entry.latest_version}</td>
                <td className="px-4 py-3 text-xs text-muted">{entry.license_terms}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    {entry.installed_at_ms === null ? (
                      <a
                        href={entry.download_url}
                        data-testid={`library-install-${entry.listing_id}`}
                        className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                      >
                        {t('market.library.install')}
                      </a>
                    ) : entry.update_available ? (
                      <a
                        href={entry.download_url}
                        data-testid={`library-update-${entry.listing_id}`}
                        className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                      >
                        {t('market.library.update')}
                      </a>
                    ) : (
                      <span className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted">
                        v{entry.version}
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
