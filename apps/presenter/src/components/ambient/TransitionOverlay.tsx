'use client';

/**
 * TransitionOverlay — Wave 11 §S11.6.
 *
 * The smooth visual handoff between the ambient idle dashboard and the
 * real session stage. Three phases:
 *
 *   1. `phase="connecting"` — overlay fades in over the dashboard.
 *   2. `phase="connecting"` → `phase="handoff"` (after `swapAtMs`):
 *       the overlay slides toward the right edge as the dashboard
 *       simultaneously slides toward the left edge.
 *   3. `phase="done"` — overlay is fully transparent; the live session
 *       is the only thing visible.
 *
 * The component is fully presentational: timing is driven by the
 * `phase` prop. Parents own the state machine. Keeping the phases
 * declarative lets callers chain animations without holding refs.
 */

import { useEffect, useState, type CSSProperties, type ReactElement } from 'react';
import type { BrandKit } from '../../lib/ambient-service';

export type TransitionPhase = 'connecting' | 'handoff' | 'done';

export interface TransitionOverlayProps {
  readonly phase: TransitionPhase;
  readonly brand: BrandKit;
  readonly headline?: string;
  readonly subline?: string;
  /** Override nowMs for tests. */
  readonly nowMs?: number;
  /** ms between connecting and the slide-out (defaults to 1400). */
  readonly dwellMs?: number;
  /** ms for the slide-out + fade-out (defaults to 900). */
  readonly exitMs?: number;
  /** When provided, the component self-progresses after `atMs`. */
  readonly scheduleFromNow?: boolean;
  readonly dataTestId?: string;
}

const DEFAULT_DWELL_MS = 1400;
const DEFAULT_EXIT_MS = 900;

export function TransitionOverlay({
  phase,
  brand,
  headline,
  subline,
  nowMs,
  dwellMs = DEFAULT_DWELL_MS,
  exitMs = DEFAULT_EXIT_MS,
  scheduleFromNow = false,
  dataTestId = 'transition-overlay',
}: TransitionOverlayProps): ReactElement {
  // Internal phase scheduler. When `scheduleFromNow` is true we walk
  // connecting → handoff → done automatically; otherwise the parent's
  // `phase` prop drives everything.
  const [internal, setInternal] = useState<TransitionPhase>(phase);
  useEffect(() => {
    setInternal(phase);
  }, [phase]);

  useEffect(() => {
    if (!scheduleFromNow) return;
    // Schedule: dwell for dwellMs in connecting, then handoff, then done.
    const dwellHandle = setTimeout(() => setInternal('handoff'), dwellMs);
    const doneHandle = setTimeout(() => setInternal('done'), dwellMs + exitMs);
    return () => {
      clearTimeout(dwellHandle);
      clearTimeout(doneHandle);
    };
  }, [scheduleFromNow, dwellMs, exitMs, nowMs]);

  const active = scheduleFromNow ? internal : phase;

  const opacity = active === 'connecting' ? 1 : active === 'handoff' ? 1 : 0;
  const translate =
    active === 'handoff' || active === 'done' ? 'translateX(100%)' : 'translateX(0)';

  const wrapperStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    zIndex: 50,
    pointerEvents: active === 'done' ? 'none' : 'auto',
    background: gradientFor(brand),
    color: '#F8FAFF',
    fontFamily: brand.font_family,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    padding: 32,
    boxSizing: 'border-box',
    opacity,
    transform: translate,
    transition: `opacity ${active === 'done' ? exitMs : 320}ms ease-in-out, transform ${active === 'done' ? exitMs : 320}ms cubic-bezier(0.4, 0, 0.2, 1)`,
    willChange: 'opacity, transform',
  };

  return (
    <div data-testid={dataTestId} data-phase={active} aria-live="polite" style={wrapperStyle}>
      <PulseDot color={brand.accent_color} />
      <h2
        style={{
          fontSize: 36,
          fontWeight: 700,
          margin: '16px 0 8px',
          color: '#F8FAFF',
        }}
      >
        {headline ?? (active === 'done' ? 'Session starting' : 'Connecting…')}
      </h2>
      <p
        style={{
          fontSize: 16,
          fontWeight: 500,
          color: 'rgba(248, 250, 255, 0.75)',
          margin: 0,
        }}
      >
        {subline ??
          (active === 'connecting'
            ? 'Bringing the session up on stage'
            : 'Resolving presenter connection')}
      </p>
      <style jsx>{`
        @keyframes transition-pulse {
          0%,
          100% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(1.6);
            opacity: 0.4;
          }
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PulseDot — indicates that the overlay is alive / working
// ---------------------------------------------------------------------------

interface PulseDotProps {
  readonly color: string;
}

function PulseDot({ color }: PulseDotProps): ReactElement {
  return (
    <div style={{ position: 'relative', width: 24, height: 24 }}>
      <span
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          background: color,
          animation: 'transition-pulse 1100ms ease-in-out infinite',
        }}
      />
      <span
        aria-hidden
        style={{
          position: 'absolute',
          inset: 4,
          borderRadius: '50%',
          background: color,
          opacity: 0.7,
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers (exposed for tests)
// ---------------------------------------------------------------------------

/** Map a "from" → "to" phase transition to the target opacity. */
export function overlayOpacityFor(phase: TransitionPhase): number {
  return phase === 'done' ? 0 : 1;
}

/** Map a "from" → "to" phase transition to the horizontal translation. */
export function overlayTranslateFor(phase: TransitionPhase): string {
  return phase === 'handoff' || phase === 'done' ? 'translateX(100%)' : 'translateX(0)';
}

/** Brand-tinted transition background. */
export function gradientFor(brand: BrandKit): string {
  return `linear-gradient(160deg, ${brand.primary_color} 0%, ${brand.secondary_color} 100%)`;
}
