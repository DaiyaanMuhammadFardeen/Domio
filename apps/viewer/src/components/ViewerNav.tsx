/**
 * ViewerNav — bottom-right chrome of the viewer.
 *
 * Per Wave 3 §S3.1 of docs/frontend-roadmap/03-wave-viewer-publishing.md.
 *
 * Surfaces: prev/next, slide counter, fullscreen, overview, help, mode
 * (stage vs scroll). Hidden when the host presentation is fullscreen.
 */

'use client';

import type { ReactElement } from 'react';

export type ViewerMode = 'stage' | 'scroll' | 'autoplay';

export interface ViewerNavProps {
  readonly currentIdx: number;
  readonly slideCount: number;
  readonly mode: ViewerMode;
  readonly onPrev: () => void;
  readonly onNext: () => void;
  readonly onToggleOverview: () => void;
  readonly onToggleHelp: () => void;
  readonly onToggleFullscreen: () => void;
  readonly onChangeMode: (mode: ViewerMode) => void;
  readonly disabled?: boolean;
  readonly dataTestId?: string;
}

export function ViewerNav({
  currentIdx,
  slideCount,
  mode,
  onPrev,
  onNext,
  onToggleOverview,
  onToggleHelp,
  onToggleFullscreen,
  onChangeMode,
  disabled,
  dataTestId = 'viewer-nav',
}: ViewerNavProps): ReactElement {
  const canPrev = currentIdx > 0;
  const canNext = currentIdx < slideCount - 1;

  return (
    <nav
      className="viewer-nav"
      data-testid={dataTestId}
      aria-label="Viewer navigation"
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        display: 'flex',
        gap: 6,
        alignItems: 'center',
        padding: '6px 10px',
        background: 'rgba(0, 0, 0, 0.6)',
        color: '#fff',
        borderRadius: 8,
        backdropFilter: 'blur(8px)',
        zIndex: 100,
        fontSize: 12,
      }}
    >
      <button
        type="button"
        onClick={onPrev}
        disabled={disabled || !canPrev}
        aria-label="Previous slide"
        data-testid={`${dataTestId}-prev`}
        style={navButtonStyle(canPrev && !disabled)}
      >
        ←
      </button>
      <span
        data-testid={`${dataTestId}-counter`}
        style={{ minWidth: 60, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}
        aria-live="polite"
      >
        {slideCount > 0 ? `${currentIdx + 1} / ${slideCount}` : '—'}
      </span>
      <button
        type="button"
        onClick={onNext}
        disabled={disabled || !canNext}
        aria-label="Next slide"
        data-testid={`${dataTestId}-next`}
        style={navButtonStyle(canNext && !disabled)}
      >
        →
      </button>

      <span style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.2)', margin: '0 4px' }} />

      {/* Mode toggle (cycles stage → scroll → autoplay → stage). */}
      <button
        type="button"
        onClick={() => {
          const next: ViewerMode = mode === 'stage' ? 'scroll' : mode === 'scroll' ? 'autoplay' : 'stage';
          onChangeMode(next);
        }}
        aria-label={`Switch to ${
          mode === 'stage' ? 'scroll' : mode === 'scroll' ? 'auto-play' : 'stage'
        } mode`}
        data-testid={`${dataTestId}-mode`}
        style={navButtonStyle(!disabled)}
      >
        {mode === 'stage' ? '⊟ Scroll' : mode === 'scroll' ? '▶ Autoplay' : '⊞ Stage'}
      </button>

      <button
        type="button"
        onClick={onToggleOverview}
        aria-label="Overview grid"
        data-testid={`${dataTestId}-overview`}
        style={navButtonStyle(!disabled)}
      >
        Grid
      </button>
      <button
        type="button"
        onClick={onToggleHelp}
        aria-label="Help"
        data-testid={`${dataTestId}-help`}
        style={navButtonStyle(!disabled)}
      >
        ?
      </button>
      <button
        type="button"
        onClick={onToggleFullscreen}
        aria-label="Fullscreen"
        data-testid={`${dataTestId}-fullscreen`}
        style={navButtonStyle(!disabled)}
      >
        ⛶
      </button>
    </nav>
  );
}

function navButtonStyle(enabled: boolean): React.CSSProperties {
  return {
    padding: '4px 8px',
    border: '1px solid rgba(255,255,255,0.2)',
    background: 'transparent',
    color: '#fff',
    borderRadius: 4,
    cursor: enabled ? 'pointer' : 'not-allowed',
    opacity: enabled ? 1 : 0.4,
    fontSize: 12,
  };
}