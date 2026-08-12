'use client';

/**
 * PresenterView — the W2 chrome.
 *
 * Layout (top-down):
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ header: title · mode · heartbeat                              │
 *   ├──────────────────────────────────────────┬───────────────────┤
 *   │ current slide · next slide preview        │ notes             │
 *   │                                            ├───────────────────┤
 *   │                                            │ timer             │
 *   │                                            ├───────────────────┤
 *   │                                            │ pairing QR        │
 *   │                                            ├───────────────────┤
 *   │                                            │ jump grid         │
 *   ├──────────────────────────────────────────┴───────────────────┤
 *   │ controls: prev / next / end · status                         │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * Data sources:
 *   - Initial state is fetched via SessionClient.get() on mount.
 *   - Mutations go through SessionClient.{advance,retreat,jump,heartbeat}.
 *   - Read-only updates flow in through the realtime gateway's
 *     presenter channel (handled in PresenterViewClient below).
 *
 * The component is client-only — the SSR pass renders a skeleton.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { JumpGrid } from './JumpGrid';
import { NotesPane } from './NotesPane';
import { PairingQR } from './PairingQR';
import { TimerDisplay } from './TimerDisplay';
import { SessionClient } from '../lib/session-service';
import type { SessionClientError } from '../lib/session-service';
import type { PairingInfo, PresenterSessionState, SlideSnapshot } from '../runtime/types';
import { AnnotationOverlay } from './annotation/AnnotationOverlay';
import { DynamicPlanPanel } from './plan/DynamicPlanPanel';
import { RehearsalPanel } from './rehearsal/RehearsalPanel';
import { TeleprompterOverlay } from './teleprompter/TeleprompterOverlay';
import { ParkingLotDrawer } from './parking-lot/ParkingLotDrawer';
import { HandoffDialog } from './handoff/HandoffDialog';
import { PipPanel } from './pip/PipPanel';
import { ProfileSelector } from './display-profile/ProfileSelector';
import { WhisperPanel } from './whisper/WhisperPanel';
import { RecapPage } from './recap/RecapPage';
import { registerServiceWorker } from '../runtime/offline/offline-cache';

export interface PresenterViewProps {
  sessionId: string;
  /** Initial state — server-rendered from the GET endpoint so the first
   *  paint already shows the active slide. */
  initialState: PresenterSessionState;
  /** Initial pairing info — also server-rendered. */
  initialPairing: PairingInfo;
  /** Base URL of the presenter-session API (relative on the same origin). */
  apiBaseUrl?: string;
}

export function PresenterView({
  sessionId,
  initialState,
  initialPairing,
  apiBaseUrl,
}: PresenterViewProps) {
  const client = useMemo(
    () => new SessionClient({ baseUrl: apiBaseUrl ?? '' }),
    [apiBaseUrl],
  );
  const [state, setState] = useState<PresenterSessionState>(initialState);
  const [pairing, setPairing] = useState<PairingInfo>(initialPairing);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; message: string } | null>(null);
  const [reducedMotionState, setReducedMotionState] = useState(false);
  const [annotationsEnabled, setAnnotationsEnabled] = useState(false);
  const [teleprompterEnabled, setTeleprompterEnabled] = useState(false);
  const [parkingLotEnabled, setParkingLotEnabled] = useState(false);
  const [handoffEnabled, setHandoffEnabled] = useState(false);
  const [recapEnabled, setRecapEnabled] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotionState(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotionState(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Register the service worker for offline support.
  useEffect(() => {
    registerServiceWorker().catch(() => { /* ignore — offline is best-effort */ });
  }, []);

  // Heartbeat — bump every 30 s to keep the session past TTL.
  useEffect(() => {
    if (state.ended_at) return;
    const handle = setInterval(() => {
      client.heartbeat(sessionId).catch(() => { /* ignore — surface on next user action */ });
    }, 30_000);
    return () => clearInterval(handle);
  }, [client, sessionId, state.ended_at]);

  // Pairing token rotation — refetch every 50 s (the token TTL is 60 s).
  useEffect(() => {
    const handle = setInterval(() => {
      client.getPairing(sessionId).then(setPairing).catch(() => { /* ignore */ });
    }, 50_000);
    return () => clearInterval(handle);
  }, [client, sessionId]);

  const activeSlide: SlideSnapshot | null = useMemo(() => {
    const slides = state.slides;
    if (slides.length === 0) return null;
    const planOrder = state.plan.order;
    const lookup = new Map(slides.map((s) => [s.slide_id, s]));
    if (planOrder.length > 0) {
      const planSlide = lookup.get(planOrder[state.state.slide_index] ?? '');
      if (planSlide) return planSlide;
    }
    return slides.find((s) => s.slide_id === state.state.slide_id) ?? slides[state.state.slide_index] ?? null;
  }, [state]);

  const nextSlide: SlideSnapshot | null = useMemo(() => {
    const slides = state.slides;
    const planOrder = state.plan.order;
    const lookup = new Map(slides.map((s) => [s.slide_id, s]));
    const nextIndex = state.state.slide_index + 1;
    if (planOrder.length > 0) {
      const nextId = planOrder[nextIndex];
      if (nextId) {
        const next = lookup.get(nextId);
        if (next) return next;
      }
    }
    return slides[nextIndex] ?? null;
  }, [state]);

  const handleAdvance = useCallback(async (dir: 1 | -1) => {
    const slides = state.slides;
    const planOrder = state.plan.order;
    const list = planOrder.length > 0 ? planOrder : slides.map((s) => s.slide_id);
    const currentId = planOrder[state.state.slide_index] ?? state.state.slide_id;
    const idx = list.indexOf(currentId);
    if (idx < 0) return;
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= list.length) return;
    const targetId = list[targetIdx]!;
    try {
      const next = await (dir === 1
        ? client.advance({ sessionId, target_slide_id: targetId, target_slide_index: targetIdx })
        : client.retreat({ sessionId, target_slide_id: targetId, target_slide_index: targetIdx }));
      setState(next);
      setStatus({ kind: 'ok', message: `Slide ${targetIdx + 1} / ${list.length}` });
    } catch (e) {
      const err = e as SessionClientError;
      setStatus({ kind: 'error', message: `Advance failed: HTTP ${err.status}` });
    }
  }, [client, sessionId, state]);

  const handleJump = useCallback(async (slide_id: string, slide_index: number) => {
    try {
      const next = await client.jump({ sessionId, target_slide_id: slide_id, target_slide_index: slide_index });
      setState(next);
      setStatus({ kind: 'ok', message: `Jumped to slide ${slide_index + 1}` });
    } catch (e) {
      const err = e as SessionClientError;
      setStatus({ kind: 'error', message: `Jump failed: HTTP ${err.status}` });
    }
  }, [client, sessionId]);

  const handleEnd = useCallback(async () => {
    if (!confirm('End this session?')) return;
    try {
      const next = await client.end(sessionId);
      setState(next);
      setStatus({ kind: 'ok', message: 'Session ended.' });
    } catch (e) {
      const err = e as SessionClientError;
      setStatus({ kind: 'error', message: `End failed: HTTP ${err.status}` });
    }
  }, [client, sessionId]);

  // Keyboard navigation: → / ← / Home / End / Esc.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        handleAdvance(1).catch(() => {});
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleAdvance(-1).catch(() => {});
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleEnd().catch(() => {});
      } else if (e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        setAnnotationsEnabled((v) => !v);
      } else if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        setTeleprompterEnabled((v) => !v);
      } else if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        setParkingLotEnabled((v) => !v);
      } else if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        setHandoffEnabled((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleAdvance, handleEnd]);

  const heartbeatStale = useMemo(() => {
    const lastMs = new Date(state.last_heartbeat_at).getTime();
    return Date.now() - lastMs > 60_000;
  }, [state.last_heartbeat_at]);

  const jumpEntries = useMemo(() => state.slides.map((s, i) => ({
    slide_id: s.slide_id,
    slide_index: i,
    title: s.title ?? `Slide ${i + 1}`,
    thumbnail_url: s.thumbnail_url,
    hidden: state.plan.hidden.includes(s.slide_id),
    is_current: s.slide_id === state.state.slide_id,
  })), [state]);

  return (
    <div className="presenter">
      <header className="presenter__header">
        <div className="presenter__title">{sessionId}</div>
        <div className={`presenter__mode presenter__mode--${state.mode}`}>{state.mode}</div>
        <div className={`presenter__heart ${heartbeatStale ? 'presenter__heart--stale' : ''}`}>
          {heartbeatStale ? 'heartbeat stale' : 'live'}
        </div>
      </header>
      <main className="presenter__main">
        <div className="slides">
          <div className="slide-card slide-card--current">
            <div className="slide-card__header">
              <span className="slide-card__label">Current slide</span>
              <span className="slide-card__index">
                {activeSlide ? `${activeSlide.slide_index + 1} / ${state.slides.length}` : '—'}
              </span>
              {annotationsEnabled && activeSlide && (
                <button
                  type="button"
                  className="slide-card__toggle"
                  onClick={() => setAnnotationsEnabled(false)}
                  aria-label="Hide annotations"
                >
                  ✕ ink
                </button>
              )}
              {!annotationsEnabled && activeSlide && (
                <button
                  type="button"
                  className="slide-card__toggle"
                  onClick={() => setAnnotationsEnabled(true)}
                  aria-label="Show annotations"
                  title="Press A to toggle"
                >
                  ✎ ink
                </button>
              )}
            </div>
            <div className="slide-card__frame">
              {activeSlide ? (
                annotationsEnabled ? (
                  <AnnotationOverlay
                    sessionId={sessionId}
                    slideId={activeSlide.slide_id}
                    presenterId={state.presenter_id}
                    apiBaseUrl={apiBaseUrl ?? ''}
                    disabled={state.ended_at !== null}
                  />
                ) : (
                  <span className="slide-card__placeholder">
                    {activeSlide.title ?? activeSlide.slide_id}
                  </span>
                )
              ) : (
                <span className="slide-card__placeholder">No slide</span>
              )}
            </div>
          </div>
          <div className="next-row">
            <div className="slide-card slide-card--next">
              <div className="slide-card__header">
                <span className="slide-card__label">Next slide</span>
                <span className="slide-card__index">
                  {nextSlide ? `${nextSlide.slide_index + 1} / ${state.slides.length}` : '—'}
                </span>
              </div>
              <div className="slide-card__frame">
                {nextSlide ? (
                  <span className="slide-card__placeholder">{nextSlide.title ?? nextSlide.slide_id}</span>
                ) : (
                  <span className="slide-card__placeholder">End of deck</span>
                )}
              </div>
            </div>
            <PairingQR pairing={pairing} reducedMotion={reducedMotionState} />
          </div>
        </div>
        <aside className="sidebar">
          <NotesPane slide={activeSlide} />
          <TimerDisplay
            startedAtMs={new Date(state.started_at).getTime()}
            budgetMs={(state.agenda_timers[0]?.duration_ms) ?? 60 * 60 * 1000}
            reducedMotion={reducedMotionState}
          />
          <DynamicPlanPanel
            sessionId={sessionId}
            state={state}
            apiBaseUrl={apiBaseUrl ?? ''}
            disabled={state.ended_at !== null}
            onUpdated={setState}
          />
          <RehearsalPanel
            sessionId={sessionId}
            state={state}
            disabled={state.ended_at !== null}
          />
          <JumpGrid slides={jumpEntries} onJump={handleJump} />
          <ProfileSelector actorId={state.presenter_id} />
          <PipPanel
            activeSlide={activeSlide}
            nextSlide={nextSlide}
            startedAtMs={new Date(state.started_at).getTime()}
            budgetMs={(state.agenda_timers[0]?.duration_ms) ?? 60 * 60 * 1000}
          />
        </aside>
      </main>
      <footer className="controls">
        <button
          type="button"
          onClick={() => handleAdvance(-1)}
          aria-label="Previous slide"
          disabled={state.state.slide_index === 0}
        >← Prev</button>
        <button
          type="button"
          className="controls__primary"
          onClick={() => handleAdvance(1)}
          aria-label="Next slide"
          disabled={state.ended_at !== null}
        >Next →</button>
        <button
          type="button"
          className="controls__danger"
          onClick={handleEnd}
          disabled={state.ended_at !== null}
        >End session</button>
        {status && (
          <div
            className={`status status--${status.kind}`}
            role="status"
            aria-live="polite"
          >
            {status.message}
          </div>
        )}
        <button
          type="button"
          className="controls__teleprompter"
          onClick={() => setTeleprompterEnabled((v) => !v)}
          aria-label="Toggle teleprompter"
          title="Press T"
        >
          {teleprompterEnabled ? '✕' : '📜'} Teleprompter
        </button>
        <button
          type="button"
          className="controls__parking-lot"
          onClick={() => setParkingLotEnabled((v) => !v)}
          aria-label="Toggle parking lot"
          title="Press P"
        >
          {parkingLotEnabled ? '✕' : '🅿️'} Parking lot
        </button>
        <button
          type="button"
          className="controls__handoff"
          onClick={() => setHandoffEnabled((v) => !v)}
          aria-label="Hand off session"
          title="Press H"
        >
          {handoffEnabled ? '✕' : '🔁'} Hand off
        </button>
        {state.ended_at && (
          <button
            type="button"
            className="controls__recap"
            onClick={() => setRecapEnabled(true)}
            aria-label="Open session recap"
          >
            📊 Recap
          </button>
        )}
      </footer>
      <TeleprompterOverlay
        slide={activeSlide}
        enabled={teleprompterEnabled}
        onClose={() => setTeleprompterEnabled(false)}
      />
      <ParkingLotDrawer
        sessionId={sessionId}
        workspaceId={state.workspace_id}
        enabled={parkingLotEnabled}
        onClose={() => setParkingLotEnabled(false)}
      />
      {handoffEnabled && (
        <HandoffDialog
          sessionId={sessionId}
          state={state}
          etag={`"${state.version}"`}
          {...(apiBaseUrl !== undefined ? { apiBaseUrl } : {})}
          onClose={() => setHandoffEnabled(false)}
          onHandover={setState}
        />
      )}
      <WhisperPanel sessionId={sessionId} presenterId={state.presenter_id} />
      {recapEnabled && (
        <RecapPage
          sessionId={sessionId}
          {...(apiBaseUrl !== undefined ? { apiBaseUrl } : {})}
          onClose={() => setRecapEnabled(false)}
        />
      )}
    </div>
  );
}