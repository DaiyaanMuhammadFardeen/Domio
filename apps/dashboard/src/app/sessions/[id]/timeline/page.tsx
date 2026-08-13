/**
 * /sessions/[id]/timeline — Presentation state timeline.
 *
 * Per Wave 11 §S11.1 of docs/frontend-roadmap/11-wave-novel-frontier.md:
 *   - Top: session header (id, deck, presenter, started_at, duration).
 *   - Three-column layout: timeline list · event detail · diff panel.
 *   - Bottom: replay button → opens the viewer in a new tab.
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  EventDetail,
  ScenarioDiff,
  SessionTimeline,
  type SessionTimelineLabels,
} from '../../../../components/timeline';
import {
  diffEvents,
  getSession,
  listSessionEvents,
  type EventChange,
  type SessionEvent,
  type SessionInfo,
} from '../../../../lib/timeline-service';

interface TimelinePageProps {
  params: Promise<{ id: string }>;
}

const LABELS: SessionTimelineLabels = {
  slideAdvance: 'Slide advance',
  scenarioToggle: 'Scenario toggle',
  annotation: 'Annotation',
  pollLaunch: 'Poll launch',
  qaSubmitted: 'Q&A submitted',
  commentAdded: 'Comment added',
  sessionStart: 'Session start',
  sessionEnd: 'Session end',
  presenter: 'Presenter',
  audience: 'Audience',
  system: 'System',
};

function formatDate(ms: number): string {
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

export default function TimelinePage({ params }: TimelinePageProps) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fromId, setFromId] = useState<string | null>(null);
  const [toId, setToId] = useState<string | null>(null);
  const [diff, setDiff] = useState<EventChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [replaying, setReplaying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function resolveParams() {
      const resolved = await params;
      if (!cancelled) setSessionId(resolved.id);
    }
    void resolveParams();
    return () => {
      cancelled = true;
    };
  }, [params]);

  useEffect(() => {
    if (sessionId === null) return;
    const id: string = sessionId;
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [info, list] = await Promise.all([
        getSession(id),
        listSessionEvents(id),
      ]);
      if (cancelled) return;
      setSession(info);
      setEvents(list);
      if (list.length > 0) {
        setSelectedId((prev) => prev ?? (list[0]?.id ?? null));
        setFromId((prev) => prev ?? (list[0]?.id ?? null));
        setToId((prev) => prev ?? (list[list.length - 1]?.id ?? null));
      }
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    if (sessionId === null || fromId === null || toId === null) {
      setDiff([]);
      return;
    }
    const sid: string = sessionId;
    const a: string = fromId;
    const b: string = toId;
    let cancelled = false;
    async function compute() {
      const result = await diffEvents(sid, a, b);
      if (!cancelled) setDiff(result.changes);
    }
    void compute();
    return () => {
      cancelled = true;
    };
  }, [sessionId, fromId, toId]);

  const selectedEvent = useMemo(
    () => events.find((e) => e.id === selectedId) ?? null,
    [events, selectedId],
  );
  const fromEvent = useMemo(
    () => events.find((e) => e.id === fromId) ?? null,
    [events, fromId],
  );
  const toEvent = useMemo(
    () => events.find((e) => e.id === toId) ?? null,
    [events, toId],
  );

  const handleReplay = useCallback(() => {
    if (!sessionId) return;
    setReplaying(true);
    const viewerUrl = `/sessions/${encodeURIComponent(sessionId)}/viewer`;
    if (typeof window !== 'undefined') {
      window.open(viewerUrl, '_blank', 'noopener,noreferrer');
    }
    // The button only flashes "Opening viewer…" briefly; we don't
    // wait for the new tab to load.
    window.setTimeout(() => setReplaying(false), 1500);
  }, [sessionId]);

  if (!sessionId) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-72 animate-pulse rounded bg-slate-200" />
      </div>
    );
  }

  const durationMs =
    session?.ended_at_ms && session.started_at_ms
      ? session.ended_at_ms - session.started_at_ms
      : session
        ? Date.now() - session.started_at_ms
        : 0;

  return (
    <div className="space-y-6">
      <header className="space-y-3" data-testid="timeline-header">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Session timeline
          </h1>
          <p className="text-sm text-slate-500">
            Reconstruct every event of a live session.
          </p>
        </div>
        {session ? (
          <dl className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm sm:grid-cols-3">
            <Field label="Session" value={session.id} />
            <Field label="Deck" value={session.deck_title || session.deck_id} />
            <Field label="Presenter" value={session.presenter_name} />
            <Field label="Started" value={formatDate(session.started_at_ms)} />
            <Field label="Duration" value={formatDuration(durationMs)} />
            <Field
              label="Attendees"
              value={String(session.attendee_count)}
            />
          </dl>
        ) : loading ? (
          <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
        ) : null}
      </header>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="h-96 animate-pulse rounded-xl bg-slate-100" />
          <div className="h-96 animate-pulse rounded-xl bg-slate-100" />
          <div className="h-96 animate-pulse rounded-xl bg-slate-100" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:max-h-[70vh] lg:overflow-y-auto lg:pr-2">
            <SessionTimeline
              events={events}
              selectedId={selectedId}
              onSelect={setSelectedId}
              diffFromId={fromId}
              diffToId={toId}
              onPickFrom={setFromId}
              onPickTo={setToId}
              labels={LABELS}
              emptyLabel="No events for this session."
            />
          </div>
          <div>
            <EventDetail
              event={selectedEvent}
              labels={LABELS}
              snapshotLabel="State snapshot"
              payloadLabel="Event payload"
            />
          </div>
          <div>
            <ScenarioDiff
              fromSummary={fromEvent?.summary ?? null}
              toSummary={toEvent?.summary ?? null}
              fromLabel="From"
              toLabel="To"
              changes={diff}
              heading="Diff between events"
              selectBothLabel="Select two events to compare"
              emptyLabel="No differences."
            />
          </div>
        </div>
      )}

      <footer className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
        <button
          type="button"
          onClick={handleReplay}
          disabled={replaying || !sessionId}
          data-testid="replay-button"
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-60"
        >
          {replaying ? 'Opening viewer…' : 'Replay session'}
        </button>
      </footer>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-medium text-slate-900">{value}</dd>
    </div>
  );
}
