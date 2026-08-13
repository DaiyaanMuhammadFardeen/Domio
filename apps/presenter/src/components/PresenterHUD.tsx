/**
 * PresenterHUD — minimal overlay for the presenter's confidence monitor.
 *
 * Per Wave 4 §S4.1 of docs/frontend-roadmap/04-wave-presenter-live.md.
 *
 * Shows: current slide index, next slide preview, agenda timer, agenda
 * progress, whisper count, audience participation count, and the
 * heartbeat status. Designed to remain visible even when the audience
 * display is fullscreen — this lives on the presenter's laptop only.
 */

'use client';

import { useCallback, useMemo, type ReactElement } from 'react';
import type { SlideSnapshot, PairingInfo } from '../runtime/types';

export interface PresenterHUDProps {
  readonly sessionId: string;
  readonly state: {
    readonly slide_index: number;
    readonly slide_id: string;
    readonly presenter_id: string;
    readonly started_at: string;
    readonly ended_at: string | null;
    readonly mode: 'live' | 'rehearsal' | 'paused';
    readonly last_heartbeat_at: string;
    readonly plan: { readonly hidden: readonly string[]; readonly order: readonly string[] };
    readonly agenda_timers: ReadonlyArray<{
      readonly id: string;
      readonly label: string;
      readonly duration_ms: number;
    }>;
  };
  readonly activeSlide: SlideSnapshot | null;
  readonly nextSlide: SlideSnapshot | null;
  readonly totalSlides: number;
  readonly pairing: PairingInfo;
  readonly whisperCount: number;
  readonly audienceParticipationCount: number;
  readonly dataTestId?: string;
}

export function PresenterHUD({
  sessionId,
  state,
  activeSlide,
  nextSlide,
  totalSlides,
  pairing,
  whisperCount,
  audienceParticipationCount,
  dataTestId = 'presenter-hud',
}: PresenterHUDProps): ReactElement {
  const heartbeatStale = useMemo(() => {
    const lastMs = new Date(state.last_heartbeat_at).getTime();
    return Date.now() - lastMs > 60_000;
  }, [state.last_heartbeat_at]);

  const totalDurationMs = useMemo(
    () => state.agenda_timers.reduce((sum, t) => sum + t.duration_ms, 0),
    [state.agenda_timers],
  );

  const elapsedMs = useMemo(() => {
    const startedMs = new Date(state.started_at).getTime();
    return Date.now() - startedMs;
  }, [state.started_at]);

  const pct =
    totalDurationMs > 0 ? Math.min(100, Math.round((elapsedMs / totalDurationMs) * 100)) : 0;

  const onCopyPair = useCallback(() => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(`${window.location.origin}/pair/${pairing.token}`);
    }
  }, [pairing.token]);

  return (
    <section
      data-testid={dataTestId}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: 12,
        border: '1px solid rgba(0,0,0,0.1)',
        borderRadius: 8,
        background: 'rgba(0,0,0,0.02)',
        fontSize: 12,
      }}
    >
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700 }}>HUD</span>
        <span
          data-testid={`${dataTestId}-mode`}
          style={{
            padding: '1px 6px',
            borderRadius: 4,
            background:
              state.mode === 'live'
                ? 'var(--success)'
                : state.mode === 'rehearsal'
                  ? 'var(--info)'
                  : 'var(--warning)',
            color: 'var(--content-inverse)',
            fontSize: 10,
            textTransform: 'uppercase',
          }}
        >
          {state.mode}
        </span>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.6)' }}>Now</div>
          <div data-testid={`${dataTestId}-now`} style={{ fontWeight: 600 }}>
            {activeSlide?.title ?? '—'} · {state.slide_index + 1}/{totalSlides}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.6)' }}>Next</div>
          <div data-testid={`${dataTestId}-next`} style={{ fontWeight: 600 }}>
            {nextSlide?.title ?? 'End'}
          </div>
        </div>
      </div>

      <div>
        <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.6)' }}>Agenda</div>
        <div
          data-testid={`${dataTestId}-agenda-bar`}
          style={{
            height: 6,
            borderRadius: 3,
            background: 'rgba(0,0,0,0.08)',
            overflow: 'hidden',
            marginTop: 2,
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: '100%',
              background: pct >= 100 ? '#dc2626' : pct >= 80 ? '#f59e0b' : '#10b981',
              transition: 'width 200ms ease',
            }}
          />
        </div>
        <div
          data-testid={`${dataTestId}-agenda-pct`}
          style={{ fontSize: 10, color: 'rgba(0,0,0,0.6)', marginTop: 2 }}
        >
          {pct}% of {Math.round(totalDurationMs / 60_000)} min
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <span data-testid={`${dataTestId}-whispers`}>
          📨 {whisperCount} whisper{whisperCount === 1 ? '' : 's'}
        </span>
        <span data-testid={`${dataTestId}-audience`}>👥 {audienceParticipationCount} audience</span>
        <span
          data-testid={`${dataTestId}-heartbeat`}
          style={{
            color: heartbeatStale ? '#dc2626' : '#059669',
            fontWeight: 600,
          }}
        >
          {heartbeatStale ? '⚠ stale' : '● live'}
        </span>
      </div>

      <div>
        <button
          type="button"
          onClick={onCopyPair}
          data-testid={`${dataTestId}-copy-pair`}
          style={{
            padding: '4px 8px',
            border: '1px solid rgba(0,0,0,0.2)',
            background: 'transparent',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 11,
          }}
        >
          Copy phone-pair link
        </button>
      </div>

      <footer style={{ fontSize: 10, color: 'rgba(0,0,0,0.4)' }}>session {sessionId}</footer>
    </section>
  );
}
