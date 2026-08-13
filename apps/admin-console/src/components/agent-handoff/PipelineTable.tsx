'use client';

/**
 * Pipeline table — Wave 10 §S10.8.
 *
 * Sortable list of recent agent-pipeline runs. Clicking a row fires
 * `onSelect` with the run_id so the parent can load the detail.
 *
 * Columns: run_id, deck_id, status, started_at, latency_ms.
 */

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { clsx } from 'clsx';
import { Badge, type BadgeTone } from '../Badge';
import type { Pipeline } from '../../lib/agent-handoff-service';

export interface PipelineTableProps {
  pipelines: ReadonlyArray<Pipeline>;
  selectedRunId?: string | null;
  onSelect: (runId: string) => void;
  emptyMessage?: string;
}

type SortKey = 'run_id' | 'deck_id' | 'status' | 'started_at_ms' | 'total_latency_ms';
type SortDir = 'asc' | 'desc';

function statusTone(status: Pipeline['status']): BadgeTone {
  switch (status) {
    case 'done':
      return 'green';
    case 'running':
      return 'amber';
    case 'error':
      return 'red';
    default:
      return 'grey';
  }
}

function formatRelTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 30 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatLatency(ms: number | undefined): string {
  if (ms === undefined) return '—';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

const COLUMNS: ReadonlyArray<{
  key: SortKey;
  label: string;
  type: 'string' | 'number';
  align?: 'left' | 'right';
}> = [
  { key: 'run_id', label: 'Run', type: 'string' },
  { key: 'deck_id', label: 'Deck', type: 'string' },
  { key: 'status', label: 'Status', type: 'string' },
  { key: 'started_at_ms', label: 'Started', type: 'number', align: 'right' },
  { key: 'total_latency_ms', label: 'Latency', type: 'number', align: 'right' },
];

function comparePipelines(a: Pipeline, b: Pipeline, key: SortKey): number {
  switch (key) {
    case 'total_latency_ms':
      return (a.total_latency_ms ?? 0) - (b.total_latency_ms ?? 0);
    case 'started_at_ms':
      return a.started_at_ms - b.started_at_ms;
    case 'run_id':
      return a.run_id.localeCompare(b.run_id);
    case 'deck_id':
      return a.deck_id.localeCompare(b.deck_id);
    case 'status':
      return a.status.localeCompare(b.status);
  }
}

export function PipelineTable({
  pipelines,
  selectedRunId,
  onSelect,
  emptyMessage = 'No pipelines yet.',
}: PipelineTableProps) {
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const sorted = useMemo(() => {
    if (!sortKey) return pipelines;
    const out = [...pipelines].sort((a, b) => comparePipelines(a, b, sortKey));
    if (sortDir === 'desc') out.reverse();
    return out;
  }, [pipelines, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir('asc');
      return;
    }
    if (sortDir === 'asc') {
      setSortDir('desc');
      return;
    }
    setSortKey(null);
    setSortDir('asc');
  }

  if (pipelines.length === 0) {
    return (
      <div
        data-testid="pipeline-table-empty"
        className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500"
      >
        {emptyMessage}
      </div>
    );
  }

  return (
    <div
      data-testid="pipeline-table"
      className="overflow-hidden rounded-xl border border-slate-200 bg-white"
    >
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              {COLUMNS.map((col) => {
                const active = sortKey === col.key;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    className={clsx(
                      'whitespace-nowrap px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-600',
                      col.align === 'right' ? 'text-right' : 'text-left',
                    )}
                  >
                    <button
                      type="button"
                      data-testid={`pipeline-sort-${col.key}`}
                      onClick={() => toggleSort(col.key)}
                      className={clsx(
                        'inline-flex items-center gap-1 transition hover:text-slate-900',
                        active && 'text-slate-900',
                      )}
                    >
                      {col.label}
                      {active && sortDir === 'asc' && <ArrowUp className="h-3 w-3" aria-hidden />}
                      {active && sortDir === 'desc' && (
                        <ArrowDown className="h-3 w-3" aria-hidden />
                      )}
                      {!active && <ArrowUpDown className="h-3 w-3 opacity-30" aria-hidden />}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map((p) => {
              const selected = selectedRunId === p.run_id;
              return (
                <tr
                  key={p.run_id}
                  data-testid={`pipeline-row-${p.run_id}`}
                  data-selected={selected ? 'true' : 'false'}
                  onClick={() => onSelect(p.run_id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelect(p.run_id);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`Open pipeline ${p.run_id}`}
                  className={clsx(
                    'cursor-pointer transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                    selected ? 'bg-brand-50/40' : 'hover:bg-slate-50',
                  )}
                >
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-slate-800">
                    {p.run_id}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-slate-800">{p.deck_id}</td>
                  <td className="whitespace-nowrap px-4 py-2.5">
                    <Badge tone={statusTone(p.status)}>{p.status}</Badge>
                  </td>
                  <td
                    className="whitespace-nowrap px-4 py-2.5 text-right text-slate-600 tabular-nums"
                    title={new Date(p.started_at_ms).toISOString()}
                  >
                    {formatRelTime(p.started_at_ms)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right font-mono text-xs text-slate-700 tabular-nums">
                    {formatLatency(p.total_latency_ms)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
