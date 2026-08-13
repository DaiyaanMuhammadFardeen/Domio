'use client';

import type { SessionEvent } from '../../lib/timeline-service';
import { EventTypeBadge } from './EventTypeBadge';
import type { SessionTimelineLabels } from './SessionTimeline';

export interface EventDetailProps {
  event: SessionEvent | null;
  labels: SessionTimelineLabels;
  snapshotLabel: string;
  payloadLabel: string;
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

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/**
 * Detail panel for the selected event. It deliberately renders the
 * event's payload and its immutable state snapshot as separate blocks
 * so operators can see both what happened and what the dashboard looked
 * like at that exact point in time.
 */
export function EventDetail({ event, labels, snapshotLabel, payloadLabel }: EventDetailProps) {
  if (!event) {
    return (
      <div
        data-testid="event-detail-empty"
        className="flex min-h-64 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500"
      >
        Select an event to inspect its state snapshot.
      </div>
    );
  }

  return (
    <div data-testid="event-detail" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <EventTypeBadge type={event.type} label={labelForType(event.type, labels)} />
          <h2 className="mt-2 text-base font-semibold text-slate-900">{event.summary}</h2>
          <p className="mt-1 text-xs text-slate-500">
            {event.actor.name} · {new Date(event.timestamp_ms).toISOString()}
          </p>
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {snapshotLabel}
        </h3>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <SnapshotValue label="Slide" value={String(event.snapshot.slide_index + 1)} />
          <SnapshotValue
            label="Scenarios"
            value={
              event.snapshot.scenarios_active.length > 0
                ? event.snapshot.scenarios_active.join(', ')
                : 'None'
            }
          />
          <SnapshotValue label="Annotations" value={String(event.snapshot.annotations_count)} />
          <SnapshotValue label="Polls" value={String(event.snapshot.polls_count)} />
          <SnapshotValue label="Q&A" value={String(event.snapshot.qa_count)} />
          <SnapshotValue label="Comments" value={String(event.snapshot.comments_count)} />
        </dl>
      </section>

      <section className="rounded-xl border border-slate-200 bg-slate-950 p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          {payloadLabel}
        </h3>
        <pre
          data-testid="event-payload"
          className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-slate-100"
        >
          {prettyJson(event.payload)}
        </pre>
      </section>
    </div>
  );
}

function SnapshotValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-medium text-slate-900">{value}</dd>
    </div>
  );
}
