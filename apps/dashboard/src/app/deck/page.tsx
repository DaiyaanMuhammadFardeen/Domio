/**
 * /deck — index page (decks list).
 *
 * Per Wave 7 §S7.1 of docs/frontend-roadmap/07-wave-analytics-insights.md:
 *   - Wired to `GET /v1/analytics/decks`.
 *   - No fabrication; renders an empty state when the warehouse
 *     returns nothing.
 *   - SuspenseBoundary + `<EmptyState>` from @domio/ui.
 */

import Link from 'next/link';
import { SuspenseBoundary, EmptyState } from '@domio/ui';
import { dashboard } from '@domio/ui/routing';
import { fetchDecks } from '../../lib/deck-service';

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

function formatPct(rate: number): string {
  if (!Number.isFinite(rate)) return '—';
  return `${(rate * 100).toFixed(1)}%`;
}

export default async function DecksIndexPage() {
  const workspaceId = process.env['NEXT_PUBLIC_WORKSPACE_ID'] ?? 'ws-demo';
  const rows = await fetchDecks(workspaceId);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Decks</h1>
        <p className="text-sm text-slate-500">
          Last 30 days · workspace{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5">{workspaceId}</code>
        </p>
      </header>

      <SuspenseBoundary>
        {rows.length === 0 ? (
          <EmptyState
            title="No decks yet"
            description="Deck analytics will appear here as soon as the event-ingest pipeline receives viewer traffic. See the overview for aggregate activity."
            action={{
              label: 'Overview',
              href: dashboard('overview'),
            }}
          />
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">Deck</th>
                  <th className="px-4 py-3 text-right">Sessions</th>
                  <th className="px-4 py-3 text-right">Viewers</th>
                  <th className="px-4 py-3 text-right">Avg. duration</th>
                  <th className="px-4 py-3 text-right">Completion</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.deckId} data-testid="deck-row">
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">{r.deckId}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.sessionCount.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.viewerCount.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatDuration(r.avgSessionMs)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatPct(r.completionRate)}</td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={dashboard('deck-detail', { id: r.deckId })}
                        className="text-xs font-medium text-brand-600 hover:underline"
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SuspenseBoundary>
    </div>
  );
}