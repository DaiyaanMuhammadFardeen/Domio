'use client';

/**
 * AudienceHeatmapOverlay — paints recent audience participation
 * events as fading dots on top of the current slide.
 *
 * Per Wave 4 §S4.14 of docs/frontend-roadmap/04-wave-presenter-live.md.
 *
 * Each event has { x, y, kind } normalized to the slide bounds. As
 * time passes, the dot fades out. The presenter can use this to spot
 * "where the audience looked" and adjust pacing / content.
 *
 * The overlay is render-only; events are pushed in by the parent
 * (`onAudienceEvent`) or seeded via `initialEvents`.
 */

import { useEffect, useRef, useState, type ReactElement } from 'react';

export type AudienceEventKind = 'click' | 'drag' | 'whisper' | 'vote' | 'question';

export interface AudienceEvent {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly kind: AudienceEventKind;
  readonly ts: number;
}

export interface AudienceHeatmapOverlayProps {
  readonly events: readonly AudienceEvent[];
  /** ms after which a dot fully fades out (default 4000). */
  readonly ttlMs?: number;
  readonly dataTestId?: string;
}

const COLOR_BY_KIND: Record<AudienceEventKind, string> = {
  click: 'var(--info)',
  drag: 'var(--success)',
  whisper: 'var(--warning)',
  vote: 'var(--danger)',
  question: 'var(--warning)',
};

export function AudienceHeatmapOverlay({
  events,
  ttlMs = 4000,
  dataTestId = 'audience-heatmap-overlay',
}: AudienceHeatmapOverlayProps): ReactElement {
  const [, setTick] = useState(0);
  const nowRef = useRef(Date.now());

  // 250 ms tick — re-renders the overlay so each dot can fade.
  useEffect(() => {
    const handle = setInterval(() => {
      nowRef.current = Date.now();
      setTick((t) => t + 1);
    }, 250);
    return () => clearInterval(handle);
  }, []);

  const now = nowRef.current;
  const visible = events.filter((e) => now - e.ts < ttlMs);

  return (
    <div
      data-testid={dataTestId}
      data-count={visible.length}
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 800,
      }}
    >
      {visible.map((e) => {
        const age = now - e.ts;
        const opacity = Math.max(0, 1 - age / ttlMs);
        const size = 24 * (1 - age / ttlMs) + 8;
        return (
          <div
            key={e.id}
            data-testid={`${dataTestId}-dot`}
            data-kind={e.kind}
            data-x={e.x.toFixed(3)}
            data-y={e.y.toFixed(3)}
            style={{
              position: 'absolute',
              left: `calc(${e.x * 100}% - ${size / 2}px)`,
              top: `calc(${e.y * 100}% - ${size / 2}px)`,
              width: size,
              height: size,
              borderRadius: '50%',
              background: COLOR_BY_KIND[e.kind],
              opacity,
              transition: 'opacity 200ms linear',
            }}
          />
        );
      })}
    </div>
  );
}