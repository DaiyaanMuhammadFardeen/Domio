'use client';

/**
 * TestSessionsPanel — Phase 10 M5.2.
 *
 * Lists the user-testing sessions for the active deck, lets the editor
 * pick a session, scrub the timeline, and inspect the VarStore snapshot
 * at the moment of any event. Backed by the @domio/prototype-recorder
 * ReplayEngine when the editor wires in a real client.
 *
 * data-testid prefix: `m5-sessions-`.
 */

import { useCallback, useMemo, useState } from 'react';
import type { ReactElement } from 'react';

export type ConsentTier = 'opt_in' | 'opt_out' | 'anonymous';

export type SessionEventType =
  | 'session_start'
  | 'session_end'
  | 'slide_enter'
  | 'slide_exit'
  | 'click'
  | 'hover'
  | 'form_submit'
  | 'calculator_change'
  | 'rage_click'
  | 'error'
  | 'device_frame_change'
  | 'consent_change';

export interface SessionEvent {
  readonly id: string;
  readonly seq: number;
  readonly eventType: SessionEventType;
  readonly createdAt: number;
  readonly region: string;
  readonly consent: ConsentTier;
}

export interface TestSessionRow {
  readonly id: string;
  readonly subjectId: string;
  readonly consent: ConsentTier;
  readonly region: string;
  readonly startedAt: number;
  readonly eventCount: number;
  readonly events: readonly SessionEvent[];
}

export interface ReplaySnapshotView {
  readonly atEvent: number;
  readonly atMs: number;
  readonly variables: Readonly<Record<string, unknown>>;
}

interface TestSessionsPanelProps {
  readonly sessions: readonly TestSessionRow[];
  readonly onSelectSession: (id: string) => void;
  readonly selectedSessionId: string | null;
  readonly onLoadSnapshot: (sessionId: string, seq: number) => ReplaySnapshotView;
  readonly onDeleteSession: (id: string) => void;
  readonly onExportSession: (id: string) => void;
  readonly onDeleteAllSessionsForSubject: (subjectId: string) => void;
}

const CONSENT_LABEL: Record<ConsentTier, string> = {
  opt_in: 'opt-in',
  opt_out: 'opted out',
  anonymous: 'anonymous',
};

export function TestSessionsPanel({
  sessions,
  onSelectSession,
  selectedSessionId,
  onLoadSnapshot,
  onDeleteSession,
  onExportSession,
  onDeleteAllSessionsForSubject,
}: TestSessionsPanelProps): ReactElement {
  const [scrubSeq, setScrubSeq] = useState<number>(1);
  const [activeSnapshot, setActiveSnapshot] = useState<ReplaySnapshotView | null>(null);

  const sorted = useMemo(() => [...sessions].sort((a, b) => b.startedAt - a.startedAt), [sessions]);

  const selected = useMemo(
    () => sorted.find((s) => s.id === selectedSessionId) ?? null,
    [sorted, selectedSessionId],
  );

  const handleScrub = useCallback(
    (seq: number) => {
      setScrubSeq(seq);
      if (selected) {
        setActiveSnapshot(onLoadSnapshot(selected.id, seq));
      }
    },
    [selected, onLoadSnapshot],
  );

  return (
    <section className="test-sessions-panel" data-testid="m5-sessions-panel">
      <header className="test-sessions-panel__header">
        <h2>User-testing sessions</h2>
        <p className="test-sessions-panel__help">
          Telemetry from the viewer. Pick a session, scrub the timeline, and inspect the variable
          snapshot at any event.
        </p>
      </header>

      <div className="test-sessions-panel__list" data-testid="m5-sessions-list">
        {sorted.length === 0 ? (
          <p className="test-sessions-panel__empty">No sessions yet.</p>
        ) : (
          <ul>
            {sorted.map((s) => (
              <li
                key={s.id}
                className={`test-sessions-panel__row${s.id === selectedSessionId ? ' is-active' : ''}`}
                data-testid="m5-sessions-row"
              >
                <button
                  type="button"
                  className="test-sessions-panel__pick"
                  data-testid="m5-sessions-select"
                  onClick={() => onSelectSession(s.id)}
                >
                  <strong>{s.subjectId}</strong>
                  <small>
                    {CONSENT_LABEL[s.consent]} · {s.region} · {s.eventCount} events
                  </small>
                </button>
                <button
                  type="button"
                  data-testid="m5-sessions-export"
                  onClick={() => onExportSession(s.id)}
                >
                  Export
                </button>
                <button
                  type="button"
                  data-testid="m5-sessions-delete"
                  onClick={() => onDeleteSession(s.id)}
                >
                  Delete
                </button>
                <button
                  type="button"
                  data-testid="m5-sessions-delete-subject"
                  onClick={() => onDeleteAllSessionsForSubject(s.subjectId)}
                >
                  Delete all for subject
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selected ? (
        <div className="test-sessions-panel__replay" data-testid="m5-sessions-replay">
          <h3>Replay — {selected.subjectId}</h3>
          <label htmlFor="m5-sessions-scrub">Scrub to event</label>
          <input
            id="m5-sessions-scrub"
            data-testid="m5-sessions-scrub"
            type="range"
            min={1}
            max={Math.max(1, selected.eventCount)}
            value={scrubSeq}
            onChange={(e) => handleScrub(Number(e.target.value))}
          />
          <span data-testid="m5-sessions-scrub-value">seq {scrubSeq}</span>

          <h4>Events</h4>
          <ol className="test-sessions-panel__events" data-testid="m5-sessions-events">
            {selected.events.map((ev) => (
              <li key={ev.id} data-testid="m5-sessions-event-row">
                <code>{ev.seq}</code>
                <span>{ev.eventType}</span>
                <small>{new Date(ev.createdAt).toISOString()}</small>
              </li>
            ))}
          </ol>

          <h4>VarStore snapshot at seq {scrubSeq}</h4>
          <pre data-testid="m5-sessions-snapshot" className="test-sessions-panel__snapshot">
            {activeSnapshot ? JSON.stringify(activeSnapshot.variables, null, 2) : '—'}
          </pre>
        </div>
      ) : null}
    </section>
  );
}
