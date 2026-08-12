/**
 * /deck — index page (decks list).
 *
 * Server component. Fetches the workspace's decks via
 * `deck-service.fetchDecks` and lists them with deep links into
 * /deck/[id]. On any failure the page renders an empty list — never
 * fabricated decks.
 */

import Link from 'next/link';
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

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          <p className="mb-2 font-medium text-slate-700">No decks yet</p>
          <p>
            Deck analytics will appear here as soon as the event-ingest pipeline
            receives viewer traffic. See{' '}
            <Link href={dashboard('overview')} className="text-brand-600 underline">
              Overview
            </Link>{' '}
            for aggregate activity.
          </p>
        </div>
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
                <tr key={r.deckId}>
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
    </div>
  );
}
