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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { JumpGrid } from './JumpGrid';
import { NotesPane } from './NotesPane';
import { PairingQR } from './PairingQR';
import { TimerDisplay } from './TimerDisplay';
import { AgendaTimer, computeAlertLevel } from './timer/AgendaTimer';
import { SoftHardAlerts } from './timer/SoftHardAlerts';
import { TimeBudgetAlerts } from './timer/TimeBudgetAlerts';
import type { AlertLevel } from './timer/AgendaTimer';
import { Rewind30s } from './Rewind30s';
import { AutoFollowPresenter } from './AutoFollowPresenter';
import { QuietMode, QuietModeBadge } from './QuietMode';
import { AudienceHeatmapOverlay } from './AudienceHeatmapOverlay';
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
import { ProfilePicker } from './display-profile/ProfilePicker';
import { OutputMirrorControls } from './display-profile/OutputMirrorControls';
import { WhisperPanel } from './whisper/WhisperPanel';
import { RecapPage } from './recap/RecapPage';
import { registerServiceWorker } from '../runtime/offline/offline-cache';
import { OfflineCache, type OfflineStatus } from '../runtime/offline/OfflineCache';
import { SnapshotFallback } from '../runtime/offline/SnapshotFallback';
import { MultiMonitorSelector } from './MultiMonitorSelector';
import { PresenterHUD } from './PresenterHUD';
import { PhoneRemote } from './phone/PhoneRemote';
import { PhonePairingPanel } from './phone/PhonePairingPanel';
import { WhisperInbox } from './whisper/WhisperInbox';

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
  const [, setAudienceDisplay] = useState<{ id: string } | null>(null);
  const [whisperCount, setWhisperCount] = useState(0);
  const [audienceParticipationCount, setAudienceParticipationCount] = useState(0);
  const [offlineStatus, setOfflineStatus] = useState<OfflineStatus>('preparing');
  const [cachedSlideCount, setCachedSlideCount] = useState(0);
  const [alertDismissed, setAlertDismissed] = useState(false);
  const [autoFollowEnabled, setAutoFollowEnabled] = useState(false);
  const [quietMode, setQuietMode] = useState(false);
  const [audienceEvents, setAudienceEvents] = useState<readonly { id: string; x: number; y: number; kind: 'click' | 'drag' | 'whisper' | 'vote' | 'question'; ts: number }[]>([]);
  const slideFrameRef = useRef<HTMLDivElement | null>(null);

  // Touch the realtime-driven setters so they're not flagged as unused.
  // S4.2 wires the realtime gateway to populate these from the presenter
  // channel; until then the values stay at 0.
  useEffect(() => {
    setWhisperCount((c) => c);
    setAudienceParticipationCount((c) => c);
    setAudienceEvents((events) => events);
  }, [sessionId]);

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
    if (typeof window === 'undefined') return;
    const onOnline = () => setOfflineStatus('online');
    const onOffline = () => setOfflineStatus((s) => (s === 'online' ? 'stale' : 'offline'));
    onOnline();
    onOffline();
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    // Phase in cache progress — the SW emits 'cache-progress' events.
    const onProgress = (e: Event) => {
      const detail = (e as CustomEvent<{ cached: number; total: number }>).detail;
      setCachedSlideCount(detail?.cached ?? 0);
      setOfflineStatus((s) => (s === 'preparing' && (detail?.cached ?? 0) >= (detail?.total ?? 0) ? 'online' : s));
    };
    window.addEventListener('cache-progress', onProgress as EventListener);

    registerServiceWorker()
      .then(() => setOfflineStatus('online'))
      .catch(() => {
        // SW registration failed — fall back to showing 'online' so we
        // don't trap the user on the preparing banner.
        setOfflineStatus('online');
      });

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('cache-progress', onProgress as EventListener);
    };
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

  // Pick the highest-alert running/paused agenda timer for the overlay.
  const activeAlert = useMemo<{ level: AlertLevel; label: string }>(() => {
    const ranked = state.agenda_timers
      .filter((t) => t.status === 'running' || t.status === 'paused')
      .map((t) => ({ id: t.id, label: t.label, level: computeAlertLevel(t.remaining_ms, t.duration_ms) }));
    const hard = ranked.find((r) => r.level === 'hard');
    const soft = ranked.find((r) => r.level === 'soft');
    const pick = hard ?? soft;
    if (!pick) return { level: 'safe', label: '' };
    return { level: pick.level, label: pick.label };
  }, [state.agenda_timers]);

  // Re-arm the overlay when the alert level changes (e.g. segment
  // rolls over from soft to hard, or new running segment starts).
  useEffect(() => {
    setAlertDismissed(false);
  }, [activeAlert.level, activeAlert.label]);

  return (
    <div className="presenter">
      <header className="presenter__header">
        <div className="presenter__title">{sessionId}</div>
        <div className={`presenter__mode presenter__mode--${state.mode}`}>{state.mode}</div>
        <div className={`presenter__heart ${heartbeatStale ? 'presenter__heart--stale' : ''}`}>
          {heartbeatStale ? 'heartbeat stale' : 'live'}
        </div>
        <QuietModeBadge quiet={quietMode} />
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
            <div className="slide-card__frame" ref={slideFrameRef}>
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
                  <SnapshotFallback isStale={offlineStatus === 'offline' || offlineStatus === 'stale'}>
                    <span className="slide-card__placeholder">
                      {activeSlide.title ?? activeSlide.slide_id}
                    </span>
                  </SnapshotFallback>
                )
              ) : (
                <span className="slide-card__placeholder">No slide</span>
              )}
              <AudienceHeatmapOverlay events={audienceEvents} />
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
          <PresenterHUD
            sessionId={sessionId}
            state={{
              slide_index: state.state.slide_index,
              slide_id: state.state.slide_id,
              presenter_id: state.presenter_id,
              started_at: state.started_at,
              ended_at: state.ended_at,
              mode: state.mode === 'live' || state.mode === 'rehearsal' ? state.mode : 'live',
              last_heartbeat_at: state.last_heartbeat_at,
              plan: state.plan,
              agenda_timers: state.agenda_timers,
            }}
            activeSlide={activeSlide}
            nextSlide={nextSlide}
            totalSlides={state.slides.length}
            pairing={pairing}
            whisperCount={whisperCount}
            audienceParticipationCount={audienceParticipationCount}
          />
          <MultiMonitorSelector
            sessionId={sessionId}
            onSelect={(d) => setAudienceDisplay(d ? { id: d.id } : null)}
          />
          <PhoneRemote
            pairing={pairing}
            {...(apiBaseUrl !== undefined ? { apiBaseUrl } : {})}
          />
          <PhonePairingPanel pairing={pairing} />
          <NotesPane slide={activeSlide} />
          <TimerDisplay
            startedAtMs={new Date(state.started_at).getTime()}
            budgetMs={(state.agenda_timers[0]?.duration_ms) ?? 60 * 60 * 1000}
            reducedMotion={reducedMotionState}
          />
          <AgendaTimer agendaTimers={state.agenda_timers} />
          <TimeBudgetAlerts dwellMs={0} budgetMs={60_000} />
          <Rewind30s onRewind={() => handleAdvance(-1)} />
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
          <ProfilePicker actorId={state.presenter_id} />
          <OutputMirrorControls mode={state.display_profile.mirror_mode} />
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
        <button
          type="button"
          className={`controls__auto-follow${autoFollowEnabled ? ' controls__auto-follow--on' : ''}`}
          onClick={() => setAutoFollowEnabled((v) => !v)}
          aria-label="Toggle auto-follow presenter"
          title="Mirror the presenter's cursor on the audience display"
          aria-pressed={autoFollowEnabled}
        >
          {autoFollowEnabled ? '✕' : '👆'} Auto-follow
        </button>
        <QuietMode quiet={quietMode} onChange={setQuietMode} />
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
      <WhisperInbox onWhisper={() => setWhisperCount((c) => c + 1)} />
      {recapEnabled && (
        <RecapPage
          sessionId={sessionId}
          {...(apiBaseUrl !== undefined ? { apiBaseUrl } : {})}
          onClose={() => setRecapEnabled(false)}
        />
      )}
      <OfflineCache
        status={offlineStatus}
        cachedSlideCount={cachedSlideCount}
        totalSlideCount={state.slides.length}
        onReconnect={() => window.location.reload()}
      />
      {!alertDismissed && activeAlert.level !== 'safe' && (
        <SoftHardAlerts
          level={activeAlert.level}
          message={
            activeAlert.level === 'hard'
              ? `${activeAlert.label}: time is up — move on.`
              : `${activeAlert.label}: 20% left, wrap up.`
          }
          onDismiss={() => setAlertDismissed(true)}
        />
      )}
      <AutoFollowPresenter
        targetRef={slideFrameRef}
        enabled={autoFollowEnabled}
      />
    </div>
  );
}