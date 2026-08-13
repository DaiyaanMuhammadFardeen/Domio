'use client';

/**
 * ListenerHistory — list of all matches in the session.
 *
 * Per Wave 11 §S11.10. Each row shows timestamp, recognized question,
 * matched slide, relevance, and the dismiss/accept status.
 */

import type { MatchedQuestion } from '../../lib/ai-listener-service';

export interface ListenerHistoryProps {
  matches: ReadonlyArray<MatchedQuestion>;
  className?: string;
}

function formatTimestamp(ms: number): string {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '—';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export function ListenerHistory({
  matches,
  className,
}: ListenerHistoryProps) {
  if (matches.length === 0) {
    return (
      <div
        data-testid="listener-history-empty"
        className={['rounded border border-dashed border-zinc-300 p-4 text-sm text-zinc-500', className ?? '']
          .filter(Boolean)
          .join(' ')}
      >
        No matches yet.
      </div>
    );
  }

  return (
    <div
      data-testid="listener-history"
      className={['overflow-hidden rounded border border-zinc-200', className ?? '']
        .filter(Boolean)
        .join(' ')}
    >
      <table className="w-full text-left text-xs">
        <thead className="bg-zinc-50 text-[10px] uppercase tracking-wide text-zinc-500">
          <tr>
            <th className="px-3 py-2">Time</th>
            <th className="px-3 py-2">Question</th>
            <th className="px-3 py-2">Slide</th>
            <th className="px-3 py-2">Relevance</th>
            <th className="px-3 py-2">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {matches.map((m) => {
            const relevancePct = Math.round((m.relevance ?? 0) * 100);
            const statusLabel =
              m.status === 'accepted'
                ? 'Accepted'
                : m.status === 'dismissed'
                ? 'Dismissed'
                : 'Pending';
            return (
              <tr key={m.id} data-testid="listener-history-row" data-match-id={m.id}>
                <td className="px-3 py-2 font-mono text-zinc-600">
                  {formatTimestamp(m.timestamp_ms)}
                </td>
                <td className="px-3 py-2 text-zinc-800">&ldquo;{m.question}&rdquo;</td>
                <td className="px-3 py-2 text-zinc-800">{m.slide_title}</td>
                <td className="px-3 py-2 text-zinc-600">{relevancePct}%</td>
                <td className="px-3 py-2">
                  <span
                    data-testid={`listener-history-status-${m.status}`}
                    className={[
                      'rounded-full px-2 py-0.5 text-[10px] font-medium',
                      m.status === 'accepted'
                        ? 'bg-emerald-100 text-emerald-700'
                        : m.status === 'dismissed'
                        ? 'bg-zinc-200 text-zinc-700'
                        : 'bg-amber-100 text-amber-700',
                    ].join(' ')}
                  >
                    {statusLabel}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
