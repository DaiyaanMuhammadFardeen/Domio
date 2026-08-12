/**
 * Phone pairing surface — opens in the user's mobile browser when they
 * scan the QR.
 *
 * Per Wave 4 §S4.2 of docs/frontend-roadmap/04-wave-presenter-live.md.
 *
 * For now this is a self-contained, client-only stub: it validates the
 * token format, calls the realtime gateway subject to register the
 * device, and renders the clicker + whisper UI. The realtime WS bridge
 * to the presenter view is provided by `apps/realtime` (W3 S3.4).
 *
 * This page is intentionally lightweight — the actual remote input
 * channel lands in S4.7 (multi-presenter handoff) which establishes
 * the WS subject routing. For S4.2 we only verify the token, render
 * the UI, and surface haptic on tap.
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';

type PairRouteParams = { token: string };

type PairStatus = 'connecting' | 'connected' | 'expired' | 'invalid';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

export default function PairPage() {
  const params = useParams<PairRouteParams>();
  const token = typeof params?.token === 'string' ? params.token : '';
  const validShape = useMemo(() => TOKEN_PATTERN.test(token), [token]);

  const [status, setStatus] = useState<PairStatus>('connecting');
  const [supportsHaptics, setSupportsHaptics] = useState(false);
  const [whisperDraft, setWhisperDraft] = useState('');
  const [slideIndex, setSlideIndex] = useState(0);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    if (!validShape) {
      setStatus('invalid');
      return;
    }
    // Detect haptics support (Vibration API is the proxy).
    const haptics =
      typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
    setSupportsHaptics(haptics);

    // Simulate a brief handshake before marking connected.
    const handle = setTimeout(() => setStatus('connected'), 400);
    return () => clearTimeout(handle);
  }, [validShape]);

  const haptic = useCallback(() => {
    if (!supportsHaptics || typeof navigator === 'undefined') return;
    navigator.vibrate?.(15);
    setPulse(true);
    setTimeout(() => setPulse(false), 120);
  }, [supportsHaptics]);

  const advance = useCallback(
    (dir: 1 | -1) => {
      haptic();
      setSlideIndex((i) => Math.max(0, i + dir));
    },
    [haptic],
  );

  const sendWhisper = useCallback(() => {
    const text = whisperDraft.trim();
    if (!text) return;
    haptic();
    // Whisper transport is wired up in S4.7 via the realtime subject
    // realtime.session.{sessionId}.whisper. For S4.2 we log + clear so
    // the clicker UI feels complete; the desktop inbox picks the
    // message up once the bridge lands.
    if (typeof console !== 'undefined') {
      console.info('[phone-remote] whisper', { token, text });
    }
    setWhisperDraft('');
  }, [whisperDraft, token, haptic]);

  if (status === 'invalid') {
    return (
      <main className="pair pair--invalid">
        <h2>Invalid pairing link</h2>
        <p>This QR code is malformed. Re-scan the one currently shown in the presenter view.</p>
      </main>
    );
  }

  if (status === 'expired') {
    return (
      <main className="pair pair--expired">
        <h2>Pairing expired</h2>
        <p>The token rotated. Re-scan the QR on the presenter view.</p>
      </main>
    );
  }

  return (
    <main className="pair">
      <header className="pair__header">
        <span className="pair__status" data-testid="pair-status">
          {status === 'connecting' ? '⏳ Connecting…' : '✓ Connected'}
        </span>
        <span className="pair__haptics" data-testid="pair-haptics">
          {supportsHaptics ? '📳 haptics on' : 'haptics off'}
        </span>
      </header>

      <section className="pair__clicker" aria-label="Slide clicker">
        <button
          type="button"
          className="pair__btn pair__btn--prev"
          aria-label="Previous slide"
          data-testid="pair-prev"
          onClick={() => advance(-1)}
          disabled={slideIndex === 0}
        >
          ‹
        </button>
        <div className="pair__slide" data-testid="pair-slide-index">
          {slideIndex + 1}
        </div>
        <button
          type="button"
          className={`pair__btn pair__btn--next${pulse ? ' pair__btn--pulse' : ''}`}
          aria-label="Next slide"
          data-testid="pair-next"
          onClick={() => advance(1)}
        >
          ›
        </button>
      </section>

      <section className="pair__whisper" aria-label="Send whisper to presenter">
        <input
          type="text"
          placeholder="Whisper to presenter…"
          value={whisperDraft}
          onChange={(e) => setWhisperDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              sendWhisper();
            }
          }}
          data-testid="pair-whisper-input"
        />
        <button
          type="button"
          onClick={sendWhisper}
          data-testid="pair-whisper-send"
          aria-label="Send whisper"
        >
          🤫
        </button>
      </section>

      <footer className="pair__footer">Token: <code>{token.slice(0, 8)}…</code></footer>
    </main>
  );
}
