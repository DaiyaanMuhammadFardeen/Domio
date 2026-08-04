'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { TimelineEngine } from '@domio/animation-runtime';
import type { Timeline, InterpolatedValue } from '@domio/animation-runtime';
import {
  createReducedMotionGuard,
  createPlaybackEngine,
  transitionDuration,
  transitionProps,
  type ScrollBinding,
  type ScrollProgressCache,
  type ReducedMotionMode,
  type ReducedMotionGuard,
  type PlaybackEngine,
  type TransitionKind,
} from '../../animation/index.js';
import {
  computeScrollDemoState,
  throttleFrame,
  type DemoTransitionKind,
} from '../../animation/demo-helpers.js';

// ─── Constants ──────────────────────────────────────────────────

const SCROLL_BINDING: ScrollBinding = {
  elementId: 'scroll-card',
  property: 'opacity',
  start: 0,
  end: 800,
  easing: 'ease-out',
};

const DEMO_TIMELINE: Timeline = {
  id: 'demo-timeline',
  elementId: 'playback-box',
  durationMs: 1200,
  loop: false,
  playCount: 1,
  startOffsetMs: 0,
  tracks: [
    {
      id: 'opacity-track',
      property: 'opacity',
      startOffsetMs: 0,
      keyframes: [
        { timeMs: 0, value: 0.2 },
        { timeMs: 600, value: 1 },
        { timeMs: 1200, value: 0.2 },
      ],
    },
    {
      id: 'translate-track',
      property: 'translateY',
      startOffsetMs: 0,
      keyframes: [
        { timeMs: 0, value: 0 },
        { timeMs: 600, value: -30 },
        { timeMs: 1200, value: 0 },
      ],
    },
  ],
  triggers: [],
};

const CYCLE_MODES: readonly ReducedMotionMode[] = [
  'follow_os',
  'always_reduced',
  'always_full',
];

const CYCLE_KINDS: readonly DemoTransitionKind[] = [
  'slide',
  'fade',
  'wipe',
  'zoom',
];

// ─── Styles ─────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: 'var(--panel)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: 24,
  marginBottom: 24,
};

const heading: React.CSSProperties = {
  margin: '0 0 8px',
  fontSize: 18,
  fontWeight: 600,
};

const muted: React.CSSProperties = {
  margin: '0 0 16px',
  color: 'var(--muted)',
  fontSize: 14,
};

const btn: React.CSSProperties = {
  background: 'var(--bg)',
  color: 'var(--fg)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '6px 14px',
  fontSize: 13,
  cursor: 'pointer',
  fontFamily: 'var(--mono)',
};

const btnActive: React.CSSProperties = {
  ...btn,
  background: 'var(--accent)',
  color: '#000',
  borderColor: 'var(--accent)',
};

const mono: React.CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 13,
  color: 'var(--muted)',
};

const box: React.CSSProperties = {
  width: 80,
  height: 80,
  borderRadius: 8,
  background: 'var(--accent)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 12,
  fontFamily: 'var(--mono)',
  color: '#000',
  fontWeight: 600,
};

// ─── Page ───────────────────────────────────────────────────────

export default function DemoPage() {
  // ── Scroll-linked state ──────────────────────────────────
  const [scrollY, setScrollY] = useState(0);
  const cacheRef = useRef<ScrollProgressCache>(new Map());

  // ── Reduced-motion guard ─────────────────────────────────
  const [modeIndex, setModeIndex] = useState(0);
  const [isReduced, setIsReduced] = useState(false);
  const guardRef = useRef<ReducedMotionGuard | null>(null);

  // Create guard once
  useEffect(() => {
    const guard = createReducedMotionGuard({
      matchMedia: (q: string) => window.matchMedia(q),
      onChange: (reduced: boolean) => setIsReduced(reduced),
    });
    guardRef.current = guard;
    setIsReduced(guard.isReduced());
    return () => guard.destroy();
  }, []);

  // Sync mode changes
  useEffect(() => {
    guardRef.current?.setMode(CYCLE_MODES[modeIndex]!);
    setIsReduced(guardRef.current?.isReduced() ?? false);
  }, [modeIndex]);

  const currentMode = CYCLE_MODES[modeIndex]!;

  // ── Scroll-linked ────────────────────────────────────────
  useEffect(() => {
    const handle = throttleFrame(
      () => setScrollY(window.scrollY),
      requestAnimationFrame,
      cancelAnimationFrame,
    );
    window.addEventListener('scroll', handle.run, { passive: true });
    return () => {
      handle.cancel();
      window.removeEventListener('scroll', handle.run);
    };
  }, []);

  const scrollState = computeScrollDemoState(
    scrollY,
    SCROLL_BINDING,
    cacheRef.current,
    isReduced,
  );

  // ── Playback engine ─────────────────────────────────────
  const engineRef = useRef<TimelineEngine | null>(null);
  const playbackRef = useRef<PlaybackEngine | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playbackValues, setPlaybackValues] = useState<readonly InterpolatedValue[]>([]);

  useEffect(() => {
    const engine = new TimelineEngine();
    engine.setRafAdapter(requestAnimationFrame, cancelAnimationFrame);
    engine.addTimeline(DEMO_TIMELINE);
    engineRef.current = engine;

    const playback = createPlaybackEngine(engine);
    playback.subscribe((values) => setPlaybackValues(values));
    playbackRef.current = playback;

    return () => {
      playback.dispose();
      engineRef.current = null;
    };
  }, []);

  const handlePlay = useCallback(() => {
    if (!playbackRef.current) return;
    playbackRef.current.play('demo-timeline', { loop: false, playCount: 1 });
    setPlaying(true);
  }, []);

  const handlePause = useCallback(() => {
    playbackRef.current?.pause();
    setPlaying(false);
  }, []);

  const handleResume = useCallback(() => {
    playbackRef.current?.resume();
    setPlaying(true);
  }, []);

  const handleStop = useCallback(() => {
    playbackRef.current?.stop();
    setPlaying(false);
    setPlaybackValues([]);
  }, []);

  // Derive playback box style from interpolated values
  const playbackStyle: React.CSSProperties = {};
  let playbackOpacity = 1;
  let playbackTranslateY = 0;
  for (const v of playbackValues) {
    if (v.property === 'opacity' && typeof v.value === 'number') {
      playbackOpacity = v.value;
    }
    if (v.property === 'translateY' && typeof v.value === 'number') {
      playbackTranslateY = v.value;
    }
  }
  playbackStyle.opacity = playbackOpacity;
  playbackStyle.transform = `translateY(${playbackTranslateY}px)`;

  // ── Transition preview ──────────────────────────────────
  const [kindIndex, setKindIndex] = useState(0);
  const [transitionActive, setTransitionActive] = useState(false);
  const currentKind: TransitionKind = CYCLE_KINDS[kindIndex]!;
  const resolvedDuration = transitionDuration(currentKind, 300);
  const clampedDuration = clampDuration(resolvedDuration, isReduced);
  const resolvedProps = transitionProps(currentKind);

  const handleNextSlide = useCallback(() => {
    setTransitionActive(false);
    // Small delay so the "reset" renders before the "enter"
    requestAnimationFrame(() => {
      setKindIndex((i) => (i + 1) % CYCLE_KINDS.length);
      setTransitionActive(true);
    });
  }, []);

  // Compute transition card style
  const transitionCardStyle: React.CSSProperties = {
    ...card,
    overflow: 'hidden',
    position: 'relative',
    minHeight: 120,
  };

  if (transitionActive) {
    if (resolvedProps.opacity) {
      transitionCardStyle.opacity = resolvedProps.opacity[1];
    }
    if (resolvedProps.transform) {
      transitionCardStyle.transform = 'none';
    }
  } else {
    if (resolvedProps.opacity) {
      transitionCardStyle.opacity = resolvedProps.opacity[0];
    }
    if (resolvedProps.transform) {
      transitionCardStyle.transform = resolvedProps.transform;
    }
  }
  transitionCardStyle.transition = `all ${clampedDuration}ms ease`;

  // ── Render ──────────────────────────────────────────────

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px' }}>
      <header style={{ textAlign: 'center', marginBottom: 48 }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, margin: '0 0 8px' }}>
          Phase 09 · Animation Demo
        </h1>
        <p style={{ ...mono, margin: 0 }}>
          Smoke surface for viewer animation modules
        </p>
      </header>

      {/* ── Scroll-linked ──────────────────────────────── */}
      <section style={card}>
        <h2 style={heading}>Scroll Linked</h2>
        <p style={muted}>
          Scroll the page — the card below responds to scroll-Y via
          <code> resolveScrollBinding</code>.
        </p>
        <div
          style={{
            ...box,
            opacity: scrollState.opacity,
            transform: scrollState.transform,
            transition: 'transform 16ms linear, opacity 16ms linear',
          }}
        >
          scroll
        </div>
        <p style={{ ...mono, marginTop: 12 }}>
          progress: {scrollState.opacity.toFixed(2)} &middot; scrollY: {scrollY}
          {isReduced ? ' · reduced → collapsed' : ''}
        </p>
      </section>

      {/* ── Reduced-motion guard ───────────────────────── */}
      <section style={card}>
        <h2 style={heading}>Reduced Motion Guard</h2>
        <p style={muted}>
          Cycle modes to see durations clamp and scroll-linked collapse.
        </p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {CYCLE_MODES.map((m, i) => (
            <button
              key={m}
              onClick={() => setModeIndex(i)}
              style={i === modeIndex ? btnActive : btn}
            >
              {m}
            </button>
          ))}
        </div>
        <p style={mono}>
          isReduced: {String(isReduced)} &middot; mode: {currentMode}
        </p>
        <p style={mono}>
          slide duration: {resolvedDuration}ms → clamped: {clampedDuration}ms
        </p>
      </section>

      {/* ── Timeline playback ──────────────────────────── */}
      <section style={card}>
        <h2 style={heading}>Timeline Playback</h2>
        <p style={muted}>
          One element animates (translate + opacity) via
          <code> createPlaybackEngine</code>.
        </p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {!playing ? (
            <button onClick={handlePlay} style={btn}>
              ▶ Play
            </button>
          ) : (
            <>
              <button onClick={handlePause} style={btn}>
                ⏸ Pause
              </button>
              <button onClick={handleResume} style={btn}>
                ▶ Resume
              </button>
            </>
          )}
          <button onClick={handleStop} style={btn}>
            ■ Stop
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{ ...box, ...playbackStyle, transition: 'none' }}>
            box
          </div>
          <div style={mono}>
            opacity: {playbackOpacity.toFixed(2)}<br />
            translateY: {playbackTranslateY.toFixed(0)}px<br />
            playing: {String(playing)}
          </div>
        </div>
      </section>

      {/* ── Transition preview ─────────────────────────── */}
      <section style={card}>
        <h2 style={heading}>Transition Preview</h2>
        <p style={muted}>
          Click &ldquo;Next Slide&rdquo; to cycle transition kinds and see
          resolved CSS props applied.
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
          <button onClick={handleNextSlide} style={btn}>
            Next Slide →
          </button>
          <span style={mono}>
            kind: <strong style={{ color: 'var(--fg)' }}>{currentKind}</strong> &middot;{' '}
            duration: {clampedDuration}ms
          </span>
        </div>
        <div style={transitionCardStyle}>
          <div style={{ padding: 24 }}>
            <p style={{ margin: 0, fontWeight: 600 }}>Slide content</p>
            <p style={{ ...mono, marginTop: 8 }}>
              transform: {resolvedProps.transform ?? 'none'}<br />
              opacity: {resolvedProps.opacity ? `[${resolvedProps.opacity.join(', ')}]` : 'n/a'}<br />
              motionHeavy: {currentKind === 'flip' || currentKind === 'cube' ? 'yes' : 'no'}
            </p>
          </div>
        </div>
      </section>

      {/* ── Spacer for scroll demo ─────────────────────── */}
      <div style={{ height: 600 }} aria-hidden>
        <p style={{ ...mono, textAlign: 'center', paddingTop: 48 }}>
          ↓ scroll up to see the scroll-linked card respond ↓
        </p>
      </div>
    </main>
  );
}

// ─── Helpers ────────────────────────────────────────────────────

function clampDuration(ms: number, isReduced: boolean): number {
  return isReduced ? 1 : ms;
}
