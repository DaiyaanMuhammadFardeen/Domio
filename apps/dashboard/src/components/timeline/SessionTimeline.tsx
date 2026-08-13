'use client';

import { clsx } from 'clsx';
import type { SessionEvent } from '../../lib/timeline-service';
import { EventTypeBadge } from './EventTypeBadge';

export interface SessionTimelineProps {
  events: ReadonlyArray<SessionEvent>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  diffFromId: string | null;
  diffToId: string | null;
  onPickFrom: (id: string) => void;
  onPickTo: (id: string) => void;
  labels: SessionTimelineLabels;
  emptyLabel: string;
}

export interface SessionTimelineLabels {
  slideAdvance: string;
  scenarioToggle: string;
  annotation: string;
  pollLaunch: string;
  qaSubmitted: string;
  commentAdded: string;
  sessionStart: string;
  sessionEnd: string;
  presenter: string;
  audience: string;
  system: string;
}

function formatTimestamp(ms: number): string {
  const d = new Date(ms);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss} UTC`;
}

function labelForType(type: SessionEvent['type'], labels: SessionTimelineLabels): string {
  switch (type) {
    case 'slide_advance':
      return labels.slideAdvance;
    case 'scenario_toggle':
      return labels.scenarioToggle;
    case 'annotation':
      return labels.annotation;
    case 'poll_launch':
      return labels.pollLaunch;
    case 'qa_submitted':
      return labels.qaSubmitted;
    case 'comment_added':
      return labels.commentAdded;
    case 'session_start':
      return labels.sessionStart;
    case 'session_end':
      return labels.sessionEnd;
    default:
      return type;
  }
}

function roleLabel(role: SessionEvent['actor']['type'], labels: SessionTimelineLabels): string {
  switch (role) {
    case 'presenter':
      return labels.presenter;
    case 'audience':
      return labels.audience;
    case 'system':
      return labels.system;
    default:
      return role;
  }
}

/**
 * Vertical timeline of every event that occurred in a live session.
 *
 * Each row shows the wall-clock timestamp, an event-type badge, the
 * actor (presenter / audience / system) and a human-readable summary.
 * Rows are selectable; they can also be tagged as the "from" or "to"
 * endpoint of a diff via the side buttons.
 */
export function SessionTimeline({
  events,
  selectedId,
  onSelect,
  diffFromId,
  diffToId,
  onPickFrom,
  onPickTo,
  labels,
  emptyLabel,
}: SessionTimelineProps) {
  if (events.length === 0) {
    return (
      <div
        role="status"
        data-testid="timeline-empty"
        className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500"
      >
        {emptyLabel}
      </div>
    );
  }

  return (
    <ol className="space-y-2" data-testid="session-timeline" aria-label="Session timeline">
      {events.map((event) => {
        const isSelected = event.id === selectedId;
        const isFrom = event.id === diffFromId;
        const isTo = event.id === diffToId;
        return (
          <li
            key={event.id}
            data-testid="timeline-event"
            className={clsx(
              'rounded-xl border bg-white p-3 shadow-sm transition-colors',
              isSelected
                ? 'border-brand-500 ring-2 ring-brand-200'
                : 'border-slate-200 hover:border-slate-300',
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <button
                type="button"
                onClick={() => onSelect(event.id)}
                className="flex-1 text-left"
                aria-pressed={isSelected}
                data-testid="timeline-event-button"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <time className="text-xs tabular-nums text-slate-500">
                    {formatTimestamp(event.timestamp_ms)}
                  </time>
                  <EventTypeBadge type={event.type} label={labelForType(event.type, labels)} />
                  <span className="text-xs text-slate-500">
                    {roleLabel(event.actor.type, labels)} ·{' '}
                    <span className="font-medium text-slate-700">{event.actor.name}</span>
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-800">{event.summary}</p>
              </button>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => onPickFrom(event.id)}
                  aria-pressed={isFrom}
                  data-testid="timeline-diff-from"
                  className={clsx(
                    'rounded-md border px-2 py-1 text-[11px] font-medium uppercase tracking-wide',
                    isFrom
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-slate-300 text-slate-600 hover:bg-slate-100',
                  )}
                >
                  A
                </button>
                <button
                  type="button"
                  onClick={() => onPickTo(event.id)}
                  aria-pressed={isTo}
                  data-testid="timeline-diff-to"
                  className={clsx(
                    'rounded-md border px-2 py-1 text-[11px] font-medium uppercase tracking-wide',
                    isTo
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-slate-300 text-slate-600 hover:bg-slate-100',
                  )}
                >
                  B
                </button>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
