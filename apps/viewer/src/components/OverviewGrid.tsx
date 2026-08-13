/**
 * OverviewGrid — thumbnail-grid slide picker, toggled with `o`.
 *
 * Per Wave 3 §S3.1 of docs/frontend-roadmap/03-wave-viewer-publishing.md.
 *
 * Bootstrap: shows a placeholder grid of slide indices. S3.12 will
 * hydrate thumbnails from the first slide element's text content.
 */

'use client';

import { useEffect, type ReactElement } from 'react';
import type { DeckDocument } from '@domio/schema/generated/scene-graph';

export interface OverviewGridProps {
  readonly deck: DeckDocument;
  readonly currentIdx: number;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onPick: (idx: number) => void;
  readonly dataTestId?: string;
}

export function OverviewGrid({
  deck,
  currentIdx,
  open,
  onClose,
  onPick,
  dataTestId = 'overview-grid',
}: OverviewGridProps): ReactElement | null {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Slide overview"
      data-testid={dataTestId}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.85)',
        zIndex: 200,
        padding: 32,
        overflow: 'auto',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 12,
          maxWidth: 1280,
          margin: '0 auto',
        }}
        data-testid={`${dataTestId}-grid`}
      >
        {deck.slides.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              onPick(i);
              onClose();
            }}
            data-testid={`${dataTestId}-slide-${i}`}
            style={{
              aspectRatio: '16 / 9',
              padding: 8,
              background: i === currentIdx ? '#1f6feb' : 'rgba(255,255,255,0.06)',
              border: `2px solid ${i === currentIdx ? '#58a6ff' : 'transparent'}`,
              borderRadius: 6,
              color: '#fff',
              cursor: 'pointer',
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>#{i + 1}</div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {s.title ?? s.semanticId}
            </div>
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onClose}
        data-testid={`${dataTestId}-close`}
        style={{
          position: 'fixed',
          top: 16,
          right: 16,
          padding: '6px 12px',
          border: '1px solid rgba(255,255,255,0.2)',
          background: 'rgba(0,0,0,0.6)',
          color: '#fff',
          borderRadius: 4,
          cursor: 'pointer',
        }}
      >
        Close (Esc)
      </button>
    </div>
  );
}
