/**
 * ViewerShell — top-level composition for the viewer.
 *
 * Per Wave 3 §S3.1 + §S3.2 of docs/frontend-roadmap/03-wave-viewer-publishing.md.
 *
 * Wires:
 *   - useViewerNav (keyboard nav + fullscreen state)
 *   - useTouchNav (swipe + pinch)
 *   - useReducedMotion (OS preference → 200ms fades fallback)
 *   - ViewerProgress (top progress bar)
 *   - SlideStage (letterboxed 16:9 stage)
 *   - ViewerNav (bottom-right chrome)
 *   - ViewerHelp (`?` modal)
 *   - OverviewGrid (`o` modal)
 *   - ScrollMode (when initialMode === 'scroll')
 *
 * Caller passes the resolved deck + an optional watermark.
 */

'use client';

import { useCallback, useState, type ReactElement } from 'react';
import type { DeckDocument } from '@domio/schema/generated/scene-graph';
import { useViewerNav } from './useViewerNav';
import { useTouchNav } from './useTouchNav';
import { useReducedMotion } from './useReducedMotion';
import { ViewerNav, type ViewerMode } from './ViewerNav';
import { ViewerProgress } from './ViewerProgress';
import { SlideStage } from './SlideStage';
import { ViewerHelp } from './ViewerHelp';
import { OverviewGrid } from './OverviewGrid';
import { ScrollMode } from './ScrollMode';
import { AutoPlayMode } from './AutoPlayMode';

export interface ViewerShellProps {
  readonly deck: DeckDocument;
  readonly initialIdx?: number;
  readonly watermark?: string;
  readonly initialMode?: ViewerMode;
  readonly onModeChange?: (mode: ViewerMode) => void;
  readonly dataTestId?: string;
}

export function ViewerShell({
  deck,
  initialIdx = 0,
  watermark,
  initialMode = 'stage',
  onModeChange,
  dataTestId = 'viewer-shell',
}: ViewerShellProps): ReactElement {
  const nav = useViewerNav({ slideCount: deck.slides.length, initialIdx });
  const reduced = useReducedMotion();
  const [internalMode, setInternalMode] = useState<ViewerMode>(initialMode);
  const mode = initialMode === internalMode ? internalMode : (initialMode ?? internalMode);

  const setMode = useCallback(
    (m: ViewerMode) => {
      setInternalMode(m);
      onModeChange?.(m);
    },
    [onModeChange],
  );

  useTouchNav({
    enabled: mode === 'stage',
    onSwipeLeft: nav.next,
    onSwipeRight: nav.prev,
    onPinchIn: nav.toggleOverview,
  });

  if (initialMode === 'scroll') {
    return (
      <ScrollMode
        deck={deck}
        reducedMotion={reduced.reduced}
        initialIdx={initialIdx}
        onExitScroll={() => setMode('stage')}
        dataTestId={`${dataTestId}-scroll`}
      />
    );
  }

  if (initialMode === 'autoplay') {
    const voiceoverUrl = `https://media.domio.app/${deck.id}/voiceover.mp3`;
    const voiceoverDurationMs = Math.max(20_000, deck.slides.length * 8_000);
    return (
      <AutoPlayMode
        deck={deck}
        voiceoverUrl={voiceoverUrl}
        voiceoverDurationMs={voiceoverDurationMs}
        reducedMotion={reduced.reduced}
        onSlideChange={(idx) => nav.goto(idx)}
        dataTestId={`${dataTestId}-autoplay`}
      />
    );
  }

  const slide = deck.slides[nav.currentIdx];

  return (
    <div
      data-testid={dataTestId}
      style={{
        position: 'relative',
        minHeight: '100vh',
        background: '#000',
        color: '#fff',
        padding: 24,
        boxSizing: 'border-box',
      }}
    >
      <ViewerProgress
        currentIdx={nav.currentIdx}
        slideCount={nav.slideCount}
        onSeek={nav.goto}
        dataTestId={`${dataTestId}-progress`}
      />

      <header
        data-testid={`${dataTestId}-header`}
        style={{ padding: '16px 0', marginBottom: 16 }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: 18,
            fontWeight: 600,
            color: 'rgba(255,255,255,0.85)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {deck.title}
        </h1>
      </header>

      <main>
        {slide ? (
          <SlideStage
            slide={slide}
            fallbackAspect={deck.settings.defaultSlideRatio}
            reducedMotion={reduced.reduced}
            {...(watermark ? { watermarkText: watermark } : {})}
            dataTestId={`${dataTestId}-slide`}
          />
        ) : (
          <div data-testid={`${dataTestId}-empty`} style={{ padding: 32, color: 'rgba(255,255,255,0.5)' }}>
            No slides
          </div>
        )}
      </main>

      <ViewerNav
        currentIdx={nav.currentIdx}
        slideCount={nav.slideCount}
        mode={internalMode}
        onPrev={nav.prev}
        onNext={nav.next}
        onToggleOverview={nav.toggleOverview}
        onToggleHelp={nav.toggleHelp}
        onToggleFullscreen={nav.toggleFullscreen}
        onChangeMode={setMode}
        dataTestId={`${dataTestId}-nav`}
      />

      <ViewerHelp open={nav.isHelpOpen} onClose={nav.toggleHelp} dataTestId={`${dataTestId}-help`} />
      <OverviewGrid
        deck={deck}
        currentIdx={nav.currentIdx}
        open={nav.isOverviewOpen}
        onClose={nav.toggleOverview}
        onPick={nav.goto}
        dataTestId={`${dataTestId}-overview`}
      />
    </div>
  );
}