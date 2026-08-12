/**
 * ScrollMode — scrollytelling wrapper that lays out one ScrollSlide per
 * deck slide + a header.
 *
 * Per Wave 3 §S3.2 of docs/frontend-roadmap/03-wave-viewer-publishing.md.
 *
 * Tracks the currently-visible slide (driven by IntersectionObserver
 * inside ScrollSlide) and surfaces it via the `onActiveSlideChange`
 * callback. The progress bar at the right edge shows deck position.
 */

'use client';

import { useEffect, useState, type ReactElement } from 'react';
import type { DeckDocument } from '@domio/schema/generated/scene-graph';
import { ScrollSlide } from './ScrollSlide';

export interface ScrollModeProps {
  readonly deck: DeckDocument;
  readonly reducedMotion: boolean;
  readonly initialIdx?: number;
  readonly onActiveSlideChange?: (idx: number) => void;
  readonly onExitScroll?: () => void;
  readonly dataTestId?: string;
}

export function ScrollMode({
  deck,
  reducedMotion,
  initialIdx = 0,
  onActiveSlideChange,
  onExitScroll,
  dataTestId = 'scroll-mode',
}: ScrollModeProps): ReactElement {
  const [activeIdx, setActiveIdx] = useState(initialIdx);

  useEffect(() => {
    onActiveSlideChange?.(activeIdx);
  }, [activeIdx, onActiveSlideChange]);

  return (
    <div
      data-testid={dataTestId}
      style={{
        position: 'relative',
        background: '#000',
        color: '#fff',
        minHeight: '100vh',
      }}
    >
      <header
        data-testid={`${dataTestId}-header`}
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 24px',
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(8px)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <h1 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{deck.title}</h1>
        <button
          type="button"
          onClick={onExitScroll}
          data-testid={`${dataTestId}-exit`}
          style={{
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.2)',
            color: '#fff',
            padding: '4px 10px',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          ← Stage mode
        </button>
      </header>

      {/* Side rail progress indicator */}
      <div
        data-testid={`${dataTestId}-rail`}
        aria-hidden
        style={{
          position: 'fixed',
          top: 64,
          right: 8,
          bottom: 64,
          width: 4,
          background: 'rgba(255,255,255,0.08)',
          borderRadius: 2,
          zIndex: 30,
        }}
      >
        <div
          data-testid={`${dataTestId}-rail-progress`}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: `${deck.slides.length > 0 ? ((activeIdx + 1) / deck.slides.length) * 100 : 0}%`,
            background: 'linear-gradient(180deg, #58a6ff, #a371f7)',
            transition: reducedMotion ? 'none' : 'height 200ms ease-out',
          }}
        />
      </div>

      {deck.slides.map((slide, i) => (
        <ScrollSlide
          key={slide.id}
          slide={slide}
          slideIdx={i}
          fallbackAspect={deck.settings.defaultSlideRatio}
          onSlideVisible={setActiveIdx}
          reducedMotion={reducedMotion}
          dataTestId={`${dataTestId}-slide-${i}`}
        />
      ))}
    </div>
  );
}