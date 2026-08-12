/**
 * ScrollSlide — a single slide in scroll-mode scrollytelling.
 *
 * Per Wave 3 §S3.2 of docs/frontend-roadmap/03-wave-viewer-publishing.md.
 *
 * Renders the slide at 100vh height. When the slide enters the viewport
 * (IntersectionObserver), the slide signals "visible" so the parent
 * ScrollMode can mark it as active + replay in-slide animations.
 *
 * Pure presentation: the parent's `onSlideVisible` callback fires once
 * per slide per scroll direction (re-fires on re-entry).
 */

'use client';

import { useEffect, useRef, type ReactElement } from 'react';
import type { Slide, AspectRatio } from '@domio/schema/generated/scene-graph';

export interface ScrollSlideProps {
  readonly slide: Slide;
  readonly slideIdx: number;
  readonly fallbackAspect: AspectRatio;
  readonly onSlideVisible?: (idx: number) => void;
  readonly reducedMotion: boolean;
  readonly dataTestId?: string;
}

export function ScrollSlide({
  slide,
  slideIdx,
  fallbackAspect,
  onSlideVisible,
  reducedMotion,
  dataTestId = 'scroll-slide',
}: ScrollSlideProps): ReactElement {
  const ref = useRef<HTMLDivElement | null>(null);
  const lastEmittedIdx = useRef<number>(-1);

  useEffect(() => {
    const el = ref.current;
    if (!el || !onSlideVisible || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && lastEmittedIdx.current !== slideIdx) {
            lastEmittedIdx.current = slideIdx;
            onSlideVisible(slideIdx);
          }
        }
      },
      { rootMargin: '0px 0px -50% 0px', threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [onSlideVisible, slideIdx]);

  const aspect = slide.aspect ?? fallbackAspect ?? { ratioW: 16, ratioH: 9 };

  return (
    <section
      ref={ref}
      data-testid={dataTestId}
      data-slide-idx={slideIdx}
      style={{
        position: 'relative',
        width: '100%',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a0a0a',
        padding: '48px 24px',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ position: 'relative', width: '100%', maxWidth: 1280 }}>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>
          Slide {slideIdx + 1} · {slide.title ?? slide.semanticId}
        </div>
        <div
          style={{
            position: 'relative',
            width: '100%',
            paddingTop: `${(aspect.ratioH / aspect.ratioW) * 100}%`,
            background: '#0F172A',
            borderRadius: 8,
            overflow: 'hidden',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            transition: reducedMotion ? 'none' : 'opacity 250ms ease-out',
          }}
          data-testid={`${dataTestId}-stage`}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              color: 'rgba(255,255,255,0.9)',
              padding: 32,
              fontSize: 16,
            }}
          >
            {slide.elements.length === 0 ? (
              <span style={{ color: 'rgba(255,255,255,0.4)' }}>(empty slide)</span>
            ) : (
              slide.elements.map((el) => (
                <div key={el.id} style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                  • {el.name} ({el.type})
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}