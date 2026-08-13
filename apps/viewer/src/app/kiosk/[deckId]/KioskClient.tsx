/**
 * KioskClient — client-side kiosk runtime for the viewer.
 *
 * Per Wave 11 §S11.14 of docs/frontend-roadmap/11-wave-novel-frontier.md.
 *
 * Composes:
 *   - TouchGestureOverlay (left/right tap zones, long-press → pause)
 *   - IdleReset (auto-reset countdown ring)
 *   - AdminPinDialog (escalated by the floating exit button)
 *   - Optional cursor-hidden body class
 *   - Optional fullscreen request on mount
 */

'use client';

import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import type { DeckDocument } from '@domio/schema/generated/scene-graph';
import { AdminPinDialog, TouchGestureOverlay, IdleReset } from '../../../components/kiosk';
import { SlideStage } from '../../../components/SlideStage';
import { getKioskConfig, verifyAdminPin, type KioskConfig } from '../../../lib/kiosk-service';

export interface KioskClientProps {
  readonly deck: DeckDocument;
  readonly heading: string;
  readonly tapAdvance: string;
  readonly tapBack: string;
  readonly longPressLabel: string;
  readonly idleResetLabel: string;
  readonly pausedLabel: string;
  readonly exitHeading: string;
  readonly exitPrompt: string;
  readonly exitSubmit: string;
  readonly exitCancel: string;
  readonly exitInvalid: string;
  readonly exitSuccess: string;
  readonly dataTestId?: string;
}

type AdminState = 'idle' | 'verifying' | 'invalid' | 'success';

export function KioskClient({
  deck,
  heading,
  tapAdvance,
  tapBack,
  longPressLabel,
  idleResetLabel,
  pausedLabel,
  exitHeading,
  exitPrompt,
  exitSubmit,
  exitCancel,
  exitInvalid,
  exitSuccess,
  dataTestId = 'kiosk-client',
}: KioskClientProps): ReactElement {
  const [config, setConfig] = useState<KioskConfig | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [adminState, setAdminState] = useState<AdminState>('idle');
  const [exited, setExited] = useState(false);
  const fullscreenAskedRef = useRef(false);

  // Load the kiosk config on mount.
  useEffect(() => {
    let cancelled = false;
    void getKioskConfig(deck.id).then((cfg: KioskConfig) => {
      if (!cancelled) setConfig(cfg);
    });
    return () => {
      cancelled = true;
    };
  }, [deck.id]);

  // Cursor-hide: add a class to <body> after 3s of no movement.
  useEffect(() => {
    if (!config?.hide_cursor) return undefined;
    if (typeof document === 'undefined') return undefined;
    let hideTimer: ReturnType<typeof setTimeout> | null = null;
    const arm = (): void => {
      document.body.classList.remove('kiosk-cursor-hidden');
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        document.body.classList.add('kiosk-cursor-hidden');
      }, 3000);
    };
    const events: readonly (keyof WindowEventMap)[] = ['pointermove', 'pointerdown', 'keydown'];
    for (const ev of events) window.addEventListener(ev, arm, { passive: true });
    arm();
    return () => {
      for (const ev of events) window.removeEventListener(ev, arm);
      if (hideTimer) clearTimeout(hideTimer);
      document.body.classList.remove('kiosk-cursor-hidden');
    };
  }, [config?.hide_cursor]);

  // Request fullscreen on first user interaction (browsers block
  // auto-request without a gesture).
  useEffect(() => {
    if (!config?.fullscreen) return undefined;
    if (fullscreenAskedRef.current) return undefined;
    if (typeof document === 'undefined') return undefined;
    const request = (): void => {
      if (fullscreenAskedRef.current) return;
      if (document.fullscreenElement) {
        fullscreenAskedRef.current = true;
        return;
      }
      document.documentElement.requestFullscreen?.().catch(() => {});
      fullscreenAskedRef.current = true;
    };
    const onFirstGesture = (): void => {
      request();
    };
    window.addEventListener('pointerdown', onFirstGesture, { once: true, passive: true });
    window.addEventListener('keydown', onFirstGesture, { once: true });
    return () => {
      window.removeEventListener('pointerdown', onFirstGesture);
      window.removeEventListener('keydown', onFirstGesture);
    };
  }, [config?.fullscreen]);

  const lastSlide = Math.max(0, deck.slides.length - 1);

  const goNext = useCallback(() => {
    setCurrentIdx((i) => Math.min(i + 1, lastSlide));
  }, [lastSlide]);

  const goPrev = useCallback(() => {
    setCurrentIdx((i) => Math.max(i - 1, 0));
  }, []);

  const goReset = useCallback(() => {
    setCurrentIdx(0);
  }, []);

  const togglePaused = useCallback(() => {
    setPaused((p) => !p);
  }, []);

  const submitPin = useCallback(
    async (pin: string): Promise<void> => {
      setAdminState('verifying');
      try {
        const res = await verifyAdminPin(deck.id, pin);
        if (res.valid) {
          setAdminState('success');
          // Tiny delay so the operator sees the success state.
          setTimeout(() => setExited(true), 400);
        } else {
          setAdminState('invalid');
        }
      } catch {
        setAdminState('invalid');
      }
    },
    [deck.id],
  );

  if (exited) {
    return (
      <div
        data-testid={`${dataTestId}-exited`}
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          background: '#000',
          fontFamily: 'system-ui',
          textAlign: 'center',
          padding: 24,
        }}
      >
        <div>
          <h1 style={{ marginTop: 0 }}>{exitSuccess}</h1>
          <p>
            <a
              href={`/${deck.id}`}
              style={{ color: '#38BDF8' }}
              data-testid={`${dataTestId}-return-link`}
            >
              ← Back to deck
            </a>
          </p>
        </div>
      </div>
    );
  }

  const slide = deck.slides[currentIdx];
  const resetAfterSec = config?.reset_after_sec ?? 60;

  return (
    <div
      data-testid={dataTestId}
      data-deck-id={deck.id}
      data-current-idx={currentIdx}
      data-paused={paused ? 'true' : 'false'}
      style={{
        position: 'relative',
        minHeight: '100vh',
        background: '#000',
        color: '#fff',
        padding: 0,
        boxSizing: 'border-box',
        overflow: 'hidden',
        fontFamily: 'system-ui',
      }}
    >
      {config ? (
        <IdleReset
          resetAfterSec={resetAfterSec}
          paused={paused || pinOpen}
          onReset={goReset}
          label={idleResetLabel.replace('{sec}', String(Math.max(0, resetAfterSec)))}
          dataTestId={`${dataTestId}-idle`}
        />
      ) : null}
      <header
        data-testid={`${dataTestId}-heading`}
        style={{
          position: 'fixed',
          top: 16,
          left: 16,
          zIndex: 80,
          padding: '6px 12px',
          background: 'rgba(0,0,0,0.6)',
          borderRadius: 4,
          fontSize: 13,
          color: 'rgba(255,255,255,0.85)',
          pointerEvents: 'none',
        }}
      >
        {heading} · {deck.title}
      </header>
      <main style={{ position: 'relative', width: '100%', height: '100vh' }}>
        {slide ? (
          <div
            data-testid={`${dataTestId}-slide-${currentIdx}`}
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 24,
              boxSizing: 'border-box',
            }}
          >
            <div style={{ width: 'min(100%, 1280px)', aspectRatio: '16/9' }}>
              <SlideStage
                slide={slide}
                fallbackAspect={deck.settings.defaultSlideRatio}
                reducedMotion={false}
                dataTestId={`${dataTestId}-stage-${currentIdx}`}
              />
            </div>
          </div>
        ) : (
          <div
            data-testid={`${dataTestId}-empty`}
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'rgba(255,255,255,0.5)',
            }}
          >
            No slides
          </div>
        )}
        <TouchGestureOverlay
          onNext={goNext}
          onPrev={goPrev}
          onLongPress={togglePaused}
          paused={paused}
          hintLabel={`${tapAdvance} · ${tapBack} · ${longPressLabel}`}
          dataTestId={`${dataTestId}-touch`}
        />
      </main>
      {paused ? (
        <div
          data-testid={`${dataTestId}-paused-banner`}
          aria-live="polite"
          style={{
            position: 'fixed',
            top: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '6px 12px',
            background: 'rgba(0,0,0,0.7)',
            color: '#fff',
            borderRadius: 4,
            fontSize: 12,
            zIndex: 95,
          }}
        >
          {pausedLabel}
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => {
          setAdminState('idle');
          setPinOpen(true);
        }}
        data-testid={`${dataTestId}-exit-button`}
        aria-label="Exit kiosk mode"
        style={{
          position: 'fixed',
          bottom: 16,
          right: 16,
          width: 36,
          height: 36,
          borderRadius: 6,
          border: '1px solid rgba(255,255,255,0.25)',
          background: 'rgba(0,0,0,0.5)',
          color: '#fff',
          fontSize: 14,
          cursor: 'pointer',
          opacity: 0.6,
          zIndex: 95,
        }}
      >
        🔒
      </button>
      <AdminPinDialog
        open={pinOpen}
        heading={exitHeading}
        prompt={exitPrompt}
        submitLabel={exitSubmit}
        cancelLabel={exitCancel}
        invalidLabel={exitInvalid}
        successLabel={exitSuccess}
        verificationState={adminState}
        onSubmit={submitPin}
        onCancel={() => {
          setPinOpen(false);
          setAdminState('idle');
        }}
        dataTestId={`${dataTestId}-pin`}
      />
    </div>
  );
}
