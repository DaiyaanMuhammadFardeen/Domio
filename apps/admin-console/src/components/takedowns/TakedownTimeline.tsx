/**
 * TakedownTimeline — Wave 9 §S9.6.
 *
 * Tiny vertical timeline showing submission → review → resolution events.
 * Renders an empty-state hint when no events are available.
 */

'use client';

import type { TakedownEvent } from '../../lib/takedown-service';

export interface TakedownTimelineProps {
  readonly events: ReadonlyArray<TakedownEvent>;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const ACTION_LABEL: Readonly<Record<TakedownEvent['action'], string>> = {
  submitted: 'Submitted',
  review_started: 'Review started',
  counter_notice: 'Counter notice filed',
  confirmed: 'Confirmed',
  dismissed: 'Dismissed',
  resolved: 'Resolved',
};

export function TakedownTimeline({ events }: TakedownTimelineProps) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        No timeline events have been recorded for this request yet.
      </p>
    );
  }

  return (
    <ol className="space-y-3" data-testid="takedown-timeline">
      {events.map((ev) => (
        <li key={ev.id} className="flex gap-3">
          <span
            aria-hidden
            className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-brand-500"
          />
          <div className="flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-sm font-medium text-slate-900">
                {ACTION_LABEL[ev.action]}
              </span>
              <span className="text-xs text-slate-500">
                {formatDate(ev.timestamp_ms)}
              </span>
            </div>
            <div className="text-xs text-slate-500">by {ev.actor}</div>
            {ev.notes && (
              <p className="mt-1 text-sm text-slate-700">{ev.notes}</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

export default TakedownTimeline;