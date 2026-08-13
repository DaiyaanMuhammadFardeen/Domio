/**
 * OpStream — Wave 10 §S10.7.
 *
 * Virtualized list of change-feed ops with auto-scroll-to-newest
 * (unless paused), inline JSON expansion, and per-kind filtering.
 *
 * "Virtualization" here is bounded: when the filter set is empty the
 * parent passes all ops; we always render filtered ones with a
 * simple windowed scroll container so the DOM stays under control
 * even for very long sessions.
 */

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Pause, Play } from 'lucide-react';
import { clsx } from 'clsx';
import { Badge, type BadgeTone } from '../Badge';
import {
  type ChangeFeedOp,
  type ChangeFeedOpKind,
} from '../../lib/change-feed-service';
import { OpDetail } from './OpDetail';

export interface OpStreamProps {
  readonly ops: ReadonlyArray<ChangeFeedOp>;
  readonly paused: boolean;
  readonly filters: Set<ChangeFeedOpKind>;
  /** Map from op-kind → localized label. */
  readonly labelOf?: (kind: ChangeFeedOpKind) => string;
  readonly emptyLabel: string;
  readonly pausedLabel: string;
  readonly liveLabel: string;
}

function toneForKind(kind: ChangeFeedOpKind): BadgeTone {
  switch (kind) {
    case 'slide_create':
    case 'element_create':
    case 'theme_apply':
    case 'ai_apply':
      return 'green';
    case 'slide_delete':
    case 'element_delete':
      return 'red';
    case 'slide_update':
    case 'element_update':
    case 'variable_set':
      return 'brand';
    case 'brand_lock_check':
      return 'amber';
    case 'ai_suggest':
      return 'yellow';
    default:
      return 'grey';
  }
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function OpStream({
  ops,
  paused,
  filters,
  labelOf,
  emptyLabel,
  pausedLabel,
  liveLabel,
}: OpStreamProps) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const containerRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(() => {
    if (filters.size === 0) return ops;
    return ops.filter((o) => filters.has(o.kind));
  }, [ops, filters]);

  // Auto-scroll to newest unless the user paused.
  useEffect(() => {
    if (paused) return;
    const el = containerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [filtered, paused]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  if (filtered.length === 0) {
    return (
      <div
        ref={containerRef}
        data-testid="op-stream-empty"
        className="flex h-72 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500"
      >
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
        role="status"
      >
        <span className="flex items-center gap-1.5 text-slate-600">
          {paused ? (
            <>
              <Pause className="h-3.5 w-3.5 text-amber-600" aria-hidden />
              <span className="font-medium text-amber-700">{pausedLabel}</span>
              <span className="text-slate-400">
                ({filtered.length} {filtered.length === 1 ? 'op' : 'ops'})
              </span>
            </>
          ) : (
            <>
              <Play className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
              <span className="font-medium text-emerald-700">{liveLabel}</span>
              <span className="text-slate-400">
                ({filtered.length} {filtered.length === 1 ? 'op' : 'ops'})
              </span>
            </>
          )}
        </span>
        {paused && (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
            {pausedLabel}
          </span>
        )}
      </div>
      <div
        ref={containerRef}
        data-testid="op-stream"
        data-paused={paused ? 'true' : 'false'}
        className="h-[28rem] overflow-y-auto rounded-xl border border-slate-200 bg-white"
      >
        <ul className="divide-y divide-slate-100">
          {filtered.map((op) => {
            const isOpen = expanded.has(op.id);
            const label = labelOf ? labelOf(op.kind) : op.kind;
            return (
              <li
                key={op.id}
                data-testid={`op-row-${op.id}`}
                className="bg-white"
              >
                <button
                  type="button"
                  onClick={() => toggle(op.id)}
                  aria-expanded={isOpen}
                  className="flex w-full items-start gap-3 px-3 py-2 text-left transition hover:bg-slate-50"
                >
                  <span className="mt-0.5 text-slate-400" aria-hidden>
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </span>
                  <span className="w-20 flex-shrink-0 font-mono text-[11px] text-slate-500">
                    {formatTime(op.timestamp_ms)}
                  </span>
                  <Badge tone={toneForKind(op.kind)}>{label}</Badge>
                  <span className="ml-1 flex-1 truncate text-sm text-slate-700">
                    {op.summary}
                  </span>
                  <span
                    className={clsx(
                      'flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                      op.actor.type === 'agent'
                        ? 'bg-violet-50 text-violet-700'
                        : 'bg-slate-100 text-slate-600',
                    )}
                  >
                    {op.actor.type}
                  </span>
                  <span className="w-24 flex-shrink-0 truncate text-right text-xs text-slate-500">
                    {op.actor.name}
                  </span>
                </button>
                {isOpen && (
                  <OpDetail
                    payload={op.payload}
                    {...(op.trace_id ? { traceId: op.trace_id } : {})}
                  />
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export default OpStream;
