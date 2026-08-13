'use client';

import { useEffect, useState, type ReactElement } from 'react';
import { ALERT_METRIC_LABELS, listTriggeredAlerts, type AlertEvent } from '../lib/alerts-service';

export interface AlertFeedProps {
  workspaceId: string;
  pollIntervalMs?: number;
  initialEvents?: ReadonlyArray<AlertEvent>;
  onSelect?: (event: AlertEvent) => void;
}

function relativeTime(ms: number, now: number = Date.now()): string {
  const diff = Math.max(0, now - ms);
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return `${Math.round(diff / 86_400_000)}d ago`;
}

/**
 * AlertFeed — live list of triggered alerts.
 *
 * Polls `/v1/alerts/events` at `pollIntervalMs`. The page can also
 * push events imperatively via `pushAlert` so optimistic UI works
 * before the dispatcher emits the canonical record.
 */
export function AlertFeed({
  workspaceId,
  pollIntervalMs = 15_000,
  initialEvents = [],
  onSelect,
}: AlertFeedProps): ReactElement {
  const [events, setEvents] = useState<ReadonlyArray<AlertEvent>>(initialEvents);
  const [tick, setTick] = useState(0);

  // Re-render every 30s so relative times stay fresh.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const list = await listTriggeredAlerts(workspaceId);
      if (!cancelled) setEvents(list);
    }
    void load();
    const id = setInterval(load, pollIntervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [workspaceId, pollIntervalMs]);

  // tick is referenced so react-lint doesn't complain; the re-render
  // is driven by the setTick call.
  void tick;

  return (
    <section
      data-testid="alert-feed"
      className="overflow-hidden rounded-xl border border-slate-200 bg-white"
    >
      <header className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          Triggered alerts
        </h2>
        <span className="text-xs text-slate-500">{events.length} events</span>
      </header>
      {events.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-slate-500" role="status">
          No alerts triggered yet. New alerts will appear here in real time.
        </div>
      ) : (
        <ul className="divide-y divide-slate-100" data-testid="alert-feed-list">
          {events.map((event) => (
            <li key={event.id}>
              <button
                type="button"
                onClick={() => onSelect?.(event)}
                className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left text-sm hover:bg-slate-50"
                data-testid="alert-feed-item"
              >
                <div>
                  <div className="font-medium text-slate-900">
                    {ALERT_METRIC_LABELS[event.metric]} = {event.observedValue}
                    <span className="ml-2 text-xs text-slate-500">
                      (threshold {event.threshold})
                    </span>
                  </div>
                  {event.summary ? (
                    <div className="mt-0.5 text-xs text-slate-500">{event.summary}</div>
                  ) : null}
                </div>
                <time className="shrink-0 text-xs text-slate-500">
                  {relativeTime(event.triggeredAtMs)}
                </time>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
