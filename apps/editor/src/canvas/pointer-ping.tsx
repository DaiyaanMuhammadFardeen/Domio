'use client';

/**
 * Pointer ping — expanding ring shown when a remote collaborator's cursor
 * appears or moves. Per doc B.4 § "Remote pings":
 *
 *   A 300px ring that fades out over 1.2 seconds at the collaborator's
 *   pointer position, coloured with the collaborator's cursor colour.
 *   Supports multiple simultaneous pings from different collaborators.
 *
 * Implementation uses a CSS keyframe animation injected once into the
 * document head. No requestAnimationFrame loops, no timers, no state —
 * the browser handles the entire lifecycle, so there is nothing to
 * clean up on unmount and zero risk of memory leaks.
 */

import type { CSSProperties, ReactElement } from 'react';
import { cursorColorFor } from '@domio/yjs-shared';

// ──────────────────────────────────────────────
//  Types
// ──────────────────────────────────────────────

/** A single ping event emitted by a remote peer. */
export interface PointerPingEvent {
  /** Unique identifier for this ping (e.g. `${actorId}-${timestamp}`). */
  id: string;
  /** The remote actor who triggered the ping. */
  actorId: string;
  /** World-space cursor position at the moment of the ping. */
  position: { x: number; y: number };
  /** Epoch-ms timestamp when the ping was triggered. */
  timestamp: number;
}

export interface PointerPingProps {
  /** Active ping events to render.  Expired pings are simply omitted. */
  events: PointerPingEvent[];
  /** Fade-out duration in milliseconds (default 1200). */
  durationMs?: number;
  /** Ring diameter in pixels (default 300). */
  ringSizePx?: number;
}

// ──────────────────────────────────────────────
//  Pure helpers (exported for testing)
// ──────────────────────────────────────────────

/** Deterministic cursor colour for an actor. */
export function pingColor(actorId: string): string {
  return cursorColorFor(actorId);
}

/** Is this event still within its animation window? */
export function isPingActive(event: PointerPingEvent, now: number, durationMs: number): boolean {
  return now - event.timestamp < durationMs;
}

/**
 * Normalised progress of a ping's animation.
 * 0 = just triggered, 1 = animation complete.
 */
export function getPingProgress(event: PointerPingEvent, now: number, durationMs: number): number {
  const elapsed = now - event.timestamp;
  return Math.min(1, Math.max(0, elapsed / durationMs));
}

// ──────────────────────────────────────────────
//  CSS keyframe injection (once, lazily)
// ──────────────────────────────────────────────

const KEYFRAME_STYLE_ID = 'domio-pointer-ping-keyframes';

/**
 * Inject the keyframe rule into the document head the first time the
 * component renders.  Safe to call repeatedly (idempotent).
 */
function ensureKeyframes(): void {
  if (typeof document === 'undefined') return; // SSR guard
  if (document.getElementById(KEYFRAME_STYLE_ID) !== null) return;

  const style = document.createElement('style');
  style.id = KEYFRAME_STYLE_ID;
  style.textContent = `
    @keyframes domio-pointer-ping {
      0% {
        transform: translate(-50%, -50%) scale(0.05);
        opacity: 0.75;
      }
      60% {
        opacity: 0.35;
      }
      100% {
        transform: translate(-50%, -50%) scale(1);
        opacity: 0;
      }
    }
  `;
  document.head.appendChild(style);
}

// ──────────────────────────────────────────────
//  Component
// ──────────────────────────────────────────────

/**
 * Renders an expanding, fading ring for each active remote-ping event.
 *
 * - Rings are positioned absolutely at `event.position`.
 * - Each ring uses the remote peer's deterministic cursor colour.
 * - The CSS animation runs entirely in the compositor — no JS timers
 *   means nothing to tear down on unmount.
 * - Expired events (timestamp + durationMs < now) are pruned during
 *   render so the component never accumulates stale DOM nodes.
 */
export function PointerPing({
  events,
  durationMs = 1200,
  ringSizePx = 300,
}: PointerPingProps): ReactElement | null {
  ensureKeyframes();

  // Prune expired events during render (no state, no side-effects).
  const now = Date.now();
  const active = events.filter((e) => isPingActive(e, now, durationMs));

  if (active.length === 0) return null;

  return (
    <>
      {active.map((event) => {
        const color = pingColor(event.actorId);

        const ringStyle: CSSProperties = {
          position: 'absolute',
          left: event.position.x,
          top: event.position.y,
          width: ringSizePx,
          height: ringSizePx,
          marginLeft: -(ringSizePx / 2),
          marginTop: -(ringSizePx / 2),
          borderRadius: '50%',
          border: `3px solid ${color}`,
          animation: `domio-pointer-ping ${durationMs}ms ease-out forwards`,
          pointerEvents: 'none',
          zIndex: 899,
        };

        return (
          <div
            key={event.id}
            data-pointer-ping=""
            data-actor-id={event.actorId}
            style={ringStyle}
          />
        );
      })}
    </>
  );
}
