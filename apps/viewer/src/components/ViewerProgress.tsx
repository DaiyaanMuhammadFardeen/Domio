/**
 * ViewerProgress — top progress bar for the viewer.
 *
 * Per Wave 3 §S3.1 of docs/frontend-roadmap/03-wave-viewer-publishing.md.
 */

'use client';

import type { ReactElement } from 'react';

export interface ViewerProgressProps {
  readonly currentIdx: number;
  readonly slideCount: number;
  readonly onSeek?: (idx: number) => void;
  readonly dataTestId?: string;
}

export function ViewerProgress({
  currentIdx,
  slideCount,
  onSeek,
  dataTestId = 'viewer-progress',
}: ViewerProgressProps): ReactElement {
  const pct = slideCount > 0 ? ((currentIdx + 1) / slideCount) * 100 : 0;
  return (
    <div
      data-testid={dataTestId}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 4,
        background: 'rgba(255, 255, 255, 0.12)',
        zIndex: 99,
      }}
      role="progressbar"
      aria-valuenow={currentIdx + 1}
      aria-valuemin={1}
      aria-valuemax={slideCount}
    >
      <div
        data-testid={`${dataTestId}-bar`}
        style={{
          height: '100%',
          width: `${pct}%`,
          background: 'linear-gradient(90deg, #58a6ff, #a371f7)',
          transition: 'width 200ms ease-out',
        }}
      />
      {onSeek && slideCount > 0 && (
        <input
          type="range"
          min={1}
          max={slideCount}
          value={currentIdx + 1}
          onChange={(e) => onSeek(Number(e.target.value) - 1)}
          aria-label="Seek slide"
          data-testid={`${dataTestId}-seek`}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            width: '100%',
            height: 12,
            opacity: 0,
            cursor: 'pointer',
            margin: 0,
          }}
        />
      )}
    </div>
  );
}