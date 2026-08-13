'use client';

import { useCallback, useState } from 'react';
import type { ThemeTokens } from '@/lib/theme-service';

export interface ThemePreviewCanvasProps {
  tokens: ThemeTokens;
  /** Optional override for the visible slide index. */
  initialSlide?: number;
}

interface SlideSpec {
  readonly heading: string;
  readonly body: string;
}

const SAMPLE_SLIDES: ReadonlyArray<SlideSpec> = [
  {
    heading: 'Vision',
    body: 'A concise summary of where we are headed and why it matters to the team this year.',
  },
  {
    heading: 'Strategy',
    body: 'Three pillars anchor the roadmap: focus, clarity, and momentum. Each pillar has a measurable target.',
  },
  {
    heading: 'Next steps',
    body: 'Ship the prototype, gather signal, then double down on what works for the next launch cycle.',
  },
];

export function ThemePreviewCanvas({ tokens, initialSlide = 0 }: ThemePreviewCanvasProps) {
  const [index, setIndex] = useState(() =>
    Math.max(0, Math.min(initialSlide, SAMPLE_SLIDES.length - 1)),
  );

  const goPrev = useCallback(() => {
    setIndex((i) => (i - 1 + SAMPLE_SLIDES.length) % SAMPLE_SLIDES.length);
  }, []);

  const goNext = useCallback(() => {
    setIndex((i) => (i + 1) % SAMPLE_SLIDES.length);
  }, []);

  const slide = SAMPLE_SLIDES[index]!;

  const stageStyle: React.CSSProperties = {
    background: tokens.color.bg,
    color: tokens.color.fg,
    fontFamily: tokens.fontFamily.body,
  };

  const accentStyle: React.CSSProperties = {
    background: tokens.color.accent,
  };

  const primaryStyle: React.CSSProperties = {
    background: tokens.color.primary,
  };

  const surfaceStyle: React.CSSProperties = {
    background: tokens.color.surface,
  };

  const headingStyle: React.CSSProperties = {
    fontFamily: tokens.fontFamily.heading,
    paddingLeft: tokens.spacing.lg,
  };

  const bodyStyle: React.CSSProperties = {
    paddingLeft: tokens.spacing.lg,
    paddingRight: tokens.spacing.lg,
    paddingBottom: tokens.spacing.md,
  };

  return (
    <div className="space-y-3" data-testid="theme-preview-canvas">
      <div
        className="relative aspect-video w-full overflow-hidden rounded-2xl border border-border"
        style={stageStyle}
        aria-label={`Theme preview slide ${index + 1} of ${SAMPLE_SLIDES.length}`}
      >
        {/* Accent bar across the top */}
        <div className="h-2 w-full" style={accentStyle} aria-hidden="true" />

        <div className="flex h-[calc(100%-0.5rem)] flex-col">
          <div className="pt-8 pb-2" style={headingStyle}>
            <h3
              className="text-3xl font-bold leading-tight"
              style={{ fontFamily: tokens.fontFamily.heading }}
            >
              {slide.heading}
            </h3>
          </div>

          <div className="px-8 py-4" style={bodyStyle}>
            <p className="max-w-xl text-sm leading-relaxed">{slide.body}</p>
          </div>

          {/* Placeholder shapes */}
          <div className="mt-auto flex items-end gap-3 p-8">
            <div
              className="h-16 w-1/3 rounded-md"
              style={surfaceStyle}
              aria-hidden="true"
            />
            <div
              className="h-12 w-1/4 rounded-md"
              style={primaryStyle}
              aria-hidden="true"
            />
            {/* Placeholder image */}
            <div
              className="ml-auto flex h-20 w-20 items-center justify-center rounded-md border border-current/20 text-[10px] uppercase tracking-widest opacity-60"
              aria-hidden="true"
            >
              img
            </div>
          </div>
        </div>
      </div>

      {/* Slide controls */}
      <div className="flex items-center justify-between text-xs">
        <button
          type="button"
          onClick={goPrev}
          aria-label="Previous slide"
          className="rounded-md border border-border bg-panel px-3 py-1.5 text-fg transition-colors hover:border-accent"
        >
          ‹ Prev
        </button>
        <p className="text-muted">
          Slide {index + 1} / {SAMPLE_SLIDES.length}
        </p>
        <button
          type="button"
          onClick={goNext}
          aria-label="Next slide"
          className="rounded-md border border-border bg-panel px-3 py-1.5 text-fg transition-colors hover:border-accent"
        >
          Next ›
        </button>
      </div>
    </div>
  );
}