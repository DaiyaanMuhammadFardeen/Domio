'use client';

import { useEffect, useState } from 'react';
import { Badge } from './Badge';
import {
  fetchCrmTimeline,
  retryAdapterRun,
  type CrmTimelineEvent,
  type AdapterHealth,
} from '../lib/crm-service';

export interface CRMTimelineProps {
  workspaceId: string;
  initialEvents?: ReadonlyArray<CrmTimelineEvent>;
  adapters?: ReadonlyArray<AdapterHealth>;
}

function formatRelative(ms: number, now: number = Date.now()): string {
  const diff = Math.max(0, now - ms);
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return `${Math.round(diff / 86_400_000)}d ago`;
}

function toneForKind(kind: CrmTimelineEvent['kind']) {
  switch (kind) {
    case 'contact_synced':
      return 'green' as const;
    case 'field_updated':
      return 'brand' as const;
    case 'tag_added':
      return 'brand' as const;
    case 'stage_changed':
      return 'amber' as const;
    case 'sync_failed':
      return 'red' as const;
    case 'retry_succeeded':
      return 'green' as const;
  }
}

/**
 * CRMTimeline — per-contact events written back to Salesforce/HubSpot.
 *
 * Lists events chronologically with provider + event kind badges.
 * The adapter retry row is rendered separately so operators can
 * re-trigger a failed run without leaving the page.
 */
export function CRMTimeline({
  workspaceId,
  initialEvents = [],
  adapters = [],
}: CRMTimelineProps) {
  const [events, setEvents] = useState<ReadonlyArray<CrmTimelineEvent>>(initialEvents);
  const [retryState, setRetryState] = useState<Record<string, 'idle' | 'pending' | 'ok' | 'fail'>>(
    {},
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const list = await fetchCrmTimeline(workspaceId);
      if (!cancelled) setEvents(list);
    }
    void load();
    const id = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [workspaceId]);

  async function handleRetry(provider: string) {
    setRetryState((prev) => ({ ...prev, [provider]: 'pending' }));
    const ok = await retryAdapterRun(workspaceId, provider);
    setRetryState((prev) => ({ ...prev, [provider]: ok ? 'ok' : 'fail' }));
  }

  return (
    <div className="space-y-4" data-testid="crm-timeline">
      {adapters.length > 0 ? (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <header className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
            Adapter health &amp; retry
          </header>
          <ul className="divide-y divide-slate-100 text-sm">
            {adapters.map((a) => {
              const state = retryState[a.provider] ?? 'idle';
              return (
                <li
                  key={a.provider}
                  className="flex items-center justify-between gap-3 px-4 py-2"
                  data-testid="crm-adapter-row"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-slate-900">{a.provider}</span>
                    <Badge tone={a.status === 'healthy' ? 'green' : a.status === 'degraded' ? 'amber' : 'red'}>
                      {a.status}
                    </Badge>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRetry(a.provider)}
                    disabled={state === 'pending'}
                    data-testid="crm-adapter-retry"
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                  >
                    {state === 'pending'
                      ? 'Retrying…'
                      : state === 'ok'
                        ? 'Retry queued'
                        : state === 'fail'
                          ? 'Retry failed'
                          : 'Retry'}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <header className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
          Per-contact events
        </header>
        {events.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-slate-500" role="status">
            No CRM events yet. Once contacts sync to Salesforce/HubSpot, events will appear here.
          </div>
        ) : (
          <ol
            className="divide-y divide-slate-100"
            data-testid="crm-event-list"
          >
            {events.map((event) => (
              <li
                key={event.id}
                className="flex items-start justify-between gap-3 px-4 py-3 text-sm"
                data-testid="crm-event-item"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-900">{event.contactName}</span>
                    <Badge tone={toneForKind(event.kind)}>{event.kind.replace(/_/g, ' ')}</Badge>
                    <span className="text-xs text-slate-500">{event.provider}</span>
                  </div>
                  <p className="text-xs text-slate-500">{event.summary}</p>
                </div>
                <time className="shrink-0 text-xs text-slate-500">
                  {formatRelative(event.occurredAtMs)}
                </time>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
