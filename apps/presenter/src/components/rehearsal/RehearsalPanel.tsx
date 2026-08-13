'use client';

/**
 * RehearsalPanel — presenter-side rehearsal recorder.
 *
 * Drives the local RehearsalEngine via Start / Pause / Advance / End
 * controls. Live tick (drift + pace color) is shown next to the
 * current slide. At end, the summary is exported as a `.drmio` JSON
 * artifact (downloadable).
 *
 * The service writes `rehearsal_run` rows via a future API endpoint
 * (out of scope for P15 W7 UI; the engine produces the local summary).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  RehearsalEngine,
  computeTick,
  type RehearsalPacingTarget,
  type RehearsalRunSummary,
  type RehearsalTick,
} from '../../runtime/rehearsal';
import type { PresenterSessionState, SlideSnapshot } from '../../runtime/types';

export interface RehearsalPanelProps {
  sessionId: string;
  state: PresenterSessionState;
  targets?: RehearsalPacingTarget[];
  disabled?: boolean;
}

export function RehearsalPanel({ sessionId, state, targets, disabled }: RehearsalPanelProps) {
  const engineRef = useRef<RehearsalEngine | null>(null);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [summary, setSummary] = useState<RehearsalRunSummary | null>(null);
  const [tick, setTick] = useState<RehearsalTick | null>(null);
  const [exported, setExported] = useState(false);

  // Push pacing targets into the engine whenever they change.
  useEffect(() => {
    if (!engineRef.current || !targets) return;
    for (const t of targets) engineRef.current.setTarget(t.slide_id, t.target_ms);
  }, [targets]);

  // Live tick — requestAnimationFrame while running, not paused.
  useEffect(() => {
    if (!running || paused) return;
    let raf = 0;
    const loop = () => {
      const t = engineRef.current?.currentTick();
      if (t) setTick(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running, paused]);

  const onStart = useCallback(() => {
    const engine = new RehearsalEngine();
    engineRef.current = engine;
    engine.start(state.state.slide_id);
    setRunning(true);
    setPaused(false);
    setSummary(null);
    setExported(false);
  }, [state.state.slide_id]);

  const onPauseToggle = useCallback(() => {
    if (!engineRef.current) return;
    if (paused) {
      engineRef.current.resume();
      setPaused(false);
    } else {
      engineRef.current.pause();
      setPaused(true);
    }
  }, [paused]);

  const onAdvance = useCallback(() => {
    if (!engineRef.current) return;
    const list =
      state.plan.order.length > 0 ? state.plan.order : state.slides.map((s) => s.slide_id);
    const cur = list.indexOf(state.state.slide_id);
    const next = list[cur + 1];
    if (next) engineRef.current.advance(next);
    else engineRef.current.markCompleted();
  }, [state]);

  const onEnd = useCallback(() => {
    if (!engineRef.current) return;
    const summary = engineRef.current.end();
    summary.session_id = sessionId;
    setSummary(summary);
    setRunning(false);
    setPaused(false);
    setTick(null);
  }, [sessionId]);

  const onExport = useCallback(() => {
    if (!summary) return;
    const blob = new Blob([JSON.stringify(summary, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rehearsal-${sessionId}.drmio.json`;
    a.click();
    URL.revokeObjectURL(url);
    setExported(true);
  }, [summary, sessionId]);

  // Live drift read-out next to the timer.
  const drift = tick?.drift_ms ?? 0;
  const driftLabel =
    tick?.target_ms === null || tick?.target_ms === undefined ? '—' : formatMs(Math.abs(drift));
  const driftSign = drift > 0 ? '+' : drift < 0 ? '−' : '';
  const pace = tick?.pace ?? null;

  return (
    <div className={`rehearsal-panel ${pace ? `rehearsal-panel--${pace}` : ''}`}>
      <header className="rehearsal-panel__header">
        <h3 className="rehearsal-panel__title">Rehearsal</h3>
        {running && (
          <span
            className={`rehearsal-panel__badge ${paused ? 'rehearsal-panel__badge--paused' : ''}`}
          >
            {paused ? 'paused' : 'live'}
          </span>
        )}
      </header>
      {!running && !summary && (
        <button
          type="button"
          className="rehearsal-panel__start"
          onClick={onStart}
          disabled={disabled}
        >
          ▶ Start rehearsal
        </button>
      )}
      {running && (
        <>
          <div className="rehearsal-panel__metric">
            <span className="rehearsal-panel__metric-label">Drift</span>
            <span className="rehearsal-panel__metric-value">
              {driftSign}
              {driftLabel}
            </span>
          </div>
          <div className="rehearsal-panel__controls">
            <button type="button" onClick={onPauseToggle} disabled={disabled}>
              {paused ? '▶ Resume' : '⏸ Pause'}
            </button>
            <button type="button" onClick={onAdvance} disabled={disabled}>
              ⏭ Next slide
            </button>
            <button
              type="button"
              className="rehearsal-panel__end"
              onClick={onEnd}
              disabled={disabled}
            >
              ⏹ End
            </button>
          </div>
        </>
      )}
      {summary && (
        <>
          <div className="rehearsal-panel__summary">
            <div className="rehearsal-panel__row">
              <span>Total</span>
              <strong>{formatMs(summary.total_ms)}</strong>
            </div>
            <div className="rehearsal-panel__row">
              <span>Paused</span>
              <strong>{formatMs(summary.paused_ms)}</strong>
            </div>
            <div className="rehearsal-panel__row">
              <span>Slides</span>
              <strong>{Object.keys(summary.per_slide_ms).length}</strong>
            </div>
            <div className="rehearsal-panel__row">
              <span>Completed</span>
              <strong>{summary.completed ? 'yes' : 'no'}</strong>
            </div>
            <details className="rehearsal-panel__detail">
              <summary>Per-slide dwell</summary>
              <ul>
                {Object.entries(summary.per_slide_ms).map(([id, ms]) => {
                  const target = summary.pacing_targets[id];
                  const slide = (state.slides as SlideSnapshot[]).find((s) => s.slide_id === id);
                  const t = computeTick(id, ms, target ?? null);
                  return (
                    <li key={id} className={`rehearsal-panel__slide-row ${t.pace ?? ''}`}>
                      <span>{slide?.title ?? id}</span>
                      <span>{formatMs(ms)}</span>
                      {target !== undefined && (
                        <span className="rehearsal-panel__drift">
                          {ms > target ? '+' : ms < target ? '−' : ''}
                          {formatMs(Math.abs(ms - target))}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </details>
          </div>
          <button type="button" onClick={onExport}>
            ⬇ Export .drmio {exported ? '(downloaded)' : ''}
          </button>
          <button
            type="button"
            className="rehearsal-panel__start"
            onClick={onStart}
            disabled={disabled}
          >
            ▶ New run
          </button>
        </>
      )}
    </div>
  );
}

function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const total = Math.round(ms);
  const m = Math.floor(total / 60_000);
  const s = Math.floor((total % 60_000) / 1000);
  const mm = (total % 1000).toString().padStart(3, '0');
  return m > 0 ? `${m}m ${s}.${mm}s` : `${s}.${mm}s`;
}
