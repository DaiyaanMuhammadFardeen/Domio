/**
 * ContentControlTab — share-dialog "Audience" tab for per-link slide visibility.
 *
 * Per Wave 3 §S3.4 of docs/frontend-roadmap/03-wave-viewer-publishing.md.
 *
 * Renders a tree of slides with checkboxes. Each share link has its
 * own checked set; an "Investor view" link excludes the appendix; an
 * "Internal view" includes everything. Saved as
 * `POST /v1/shares/{id}/slides` with `{ visible: [slideIds] }`.
 */

'use client';

import { useCallback, useMemo, type ReactElement } from 'react';
import { FormattedMessage } from '@domio/ui';
import type { DeckDocument } from '@domio/schema/generated/scene-graph';

export interface ContentControlTabProps {
  readonly deck: DeckDocument;
  /** IDs of slides currently visible to this share link. */
  readonly value: readonly string[];
  readonly onChange: (next: readonly string[]) => void;
  readonly dataTestId?: string;
}

export function ContentControlTab({
  deck,
  value,
  onChange,
  dataTestId = 'content-control-tab',
}: ContentControlTabProps): ReactElement {
  const visibleSet = useMemo(() => new Set(value), [value]);
  const allSelected = deck.slides.every((s) => visibleSet.has(s.id));
  const noneSelected = deck.slides.every((s) => !visibleSet.has(s.id));

  const onToggle = useCallback(
    (slideId: string) => {
      const next = new Set(visibleSet);
      if (next.has(slideId)) next.delete(slideId);
      else next.add(slideId);
      onChange([...next]);
    },
    [onChange, visibleSet],
  );

  const onSelectAll = useCallback(() => {
    onChange(deck.slides.map((s) => s.id));
  }, [deck.slides, onChange]);

  const onSelectNone = useCallback(() => {
    onChange([]);
  }, [onChange]);

  const onSelectRange = useCallback(
    (fromIdx: number, toIdx: number) => {
      const ids = deck.slides.slice(fromIdx, toIdx + 1).map((s) => s.id);
      onChange(ids);
    },
    [deck.slides, onChange],
  );

  return (
    <section data-testid={dataTestId} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>
          <FormattedMessage id="editor.share.contentControl.title" />
        </strong>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            type="button"
            onClick={onSelectAll}
            data-testid={`${dataTestId}-all`}
            disabled={allSelected}
            style={toggleButtonStyle}
          >
            <FormattedMessage id="editor.share.contentControl.all" />
          </button>
          <button
            type="button"
            onClick={onSelectNone}
            data-testid={`${dataTestId}-none`}
            disabled={noneSelected}
            style={toggleButtonStyle}
          >
            <FormattedMessage id="editor.share.contentControl.none" />
          </button>
        </div>
      </header>
      <p style={{ fontSize: 12, color: 'rgba(0,0,0,0.6)', margin: 0 }}>
        <FormattedMessage id="editor.share.contentControl.help" />
      </p>
      <ul
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        {deck.slides.map((slide, idx) => {
          const checked = visibleSet.has(slide.id);
          return (
            <li
              key={slide.id}
              data-testid={`${dataTestId}-row-${slide.id}`}
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(slide.id)}
                data-testid={`${dataTestId}-check-${slide.id}`}
                aria-label={slide.title ?? `Slide ${idx + 1}`}
              />
              <span style={{ flex: 1 }}>{slide.title ?? `Slide ${idx + 1}`}</span>
              <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.5)' }}>#{idx + 1}</span>
              <button
                type="button"
                onClick={() => onSelectRange(idx, deck.slides.length - 1)}
                data-testid={`${dataTestId}-tail-${slide.id}`}
                title="Tail to end"
                style={{ ...toggleButtonStyle, fontSize: 11 }}
              >
                <FormattedMessage id="editor.share.contentControl.tail" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const toggleButtonStyle: React.CSSProperties = {
  padding: '4px 8px',
  border: '1px solid rgba(0,0,0,0.2)',
  borderRadius: 4,
  background: 'transparent',
  cursor: 'pointer',
  fontSize: 12,
};
