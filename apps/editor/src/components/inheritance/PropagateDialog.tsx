/**
 * PropagateDialog — selective push of slides from master to derived decks.
 *
 * Per Wave 11 §S11.8 of docs/frontend-roadmap/11-wave-novel-frontier.md.
 *
 * Lists every slide in the master with a checkbox. Each row shows:
 *   - slide title
 *   - "Last changed at" timestamp
 *   - "N downstream decks will be affected" count
 *
 * Actions:
 *   - Push selected (requires at least one selection)
 *   - Push all
 *   - Cancel
 */

'use client';

import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { FormattedMessage } from '@domio/ui';

export interface PropagateSlide {
  readonly id: string;
  readonly title: string;
  /** Unix epoch milliseconds — when this slide last changed in the master. */
  readonly lastChangedAtMs: number;
  /** How many downstream decks will be affected if this slide is pushed. */
  readonly affectedDeckCount: number;
}

export interface PropagateDialogProps {
  readonly open: boolean;
  readonly slides: readonly PropagateSlide[];
  readonly masterTitle?: string;
  readonly onCancel: () => void;
  readonly onPush: (slideIds: readonly string[]) => Promise<void> | void;
  readonly dataTestId?: string;
}

function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString();
}

export function PropagateDialog({
  open,
  slides,
  masterTitle,
  onCancel,
  onPush,
  dataTestId = 'propagate-dialog',
}: PropagateDialogProps): ReactElement | null {
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());

  // Reset selection whenever the dialog re-opens.
  useEffect(() => {
    if (open) {
      setSelected(new Set());
    }
  }, [open]);

  const allSelected = useMemo(
    () => slides.length > 0 && slides.every((s) => selected.has(s.id)),
    [slides, selected],
  );

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelected(new Set(slides.map((s) => s.id)));
  }, [slides]);

  const deselectAll = useCallback(() => {
    setSelected(new Set());
  }, []);

  const pushSelected = useCallback(async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    await onPush(ids);
  }, [onPush, selected]);

  const pushAll = useCallback(async () => {
    await onPush(slides.map((s) => s.id));
  }, [onPush, slides]);

  if (!open) return null;

  return (
    <div
      data-testid={dataTestId}
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${dataTestId}-heading`}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: 'white',
          color: '#111',
          padding: 20,
          borderRadius: 8,
          width: 'min(720px, 92vw)',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h2 id={`${dataTestId}-heading`} style={{ margin: 0, fontSize: 18 }}>
            <FormattedMessage id="editor.inheritance.propagate.heading" />
            {masterTitle ? <span style={{ fontWeight: 400, marginLeft: 8 }}>· {masterTitle}</span> : null}
          </h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={allSelected ? deselectAll : selectAll}
              data-testid={`${dataTestId}-select-all`}
              style={{ padding: '4px 10px', cursor: 'pointer' }}
            >
              <FormattedMessage id={allSelected ? 'editor.inheritance.propagate.deselectAll' : 'editor.inheritance.propagate.selectAll'} />
            </button>
          </div>
        </header>

        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            border: '1px solid rgba(0,0,0,0.12)',
            borderRadius: 6,
          }}
        >
          <ul role="list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {slides.length === 0 ? (
              <li style={{ padding: 16, textAlign: 'center', opacity: 0.6 }}>
                No slides available.
              </li>
            ) : null}
            {slides.map((slide) => {
              const checked = selected.has(slide.id);
              return (
                <li
                  key={slide.id}
                  data-testid={`${dataTestId}-slide-${slide.id}`}
                  data-selected={checked}
                  style={{
                    padding: '10px 12px',
                    borderBottom: '1px solid rgba(0,0,0,0.06)',
                    background: checked ? 'rgba(59,130,246,0.06)' : 'transparent',
                  }}
                >
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(slide.id)}
                      data-testid={`${dataTestId}-slide-${slide.id}-checkbox`}
                      style={{ marginTop: 3 }}
                    />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontWeight: 600 }}>{slide.title}</span>
                      <span style={{ display: 'block', fontSize: 12, opacity: 0.7 }}>
                        <FormattedMessage id="editor.inheritance.propagate.lastChanged" /> {formatTimestamp(slide.lastChangedAtMs)}
                      </span>
                      <span style={{ display: 'block', fontSize: 12, opacity: 0.7 }}>
                        <FormattedMessage
                          id="editor.inheritance.propagate.affectedDecks"
                          values={{ n: slide.affectedDeckCount }}
                        />
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>

        <footer style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            type="button"
            onClick={onCancel}
            data-testid={`${dataTestId}-cancel`}
            style={{ padding: '6px 14px', cursor: 'pointer' }}
          >
            <FormattedMessage id="editor.inheritance.propagate.cancel" />
          </button>
          <button
            type="button"
            onClick={pushAll}
            data-testid={`${dataTestId}-push-all`}
            style={{ padding: '6px 14px', cursor: 'pointer' }}
          >
            <FormattedMessage id="editor.inheritance.propagate.pushAll" />
          </button>
          <button
            type="button"
            onClick={pushSelected}
            disabled={selected.size === 0}
            data-testid={`${dataTestId}-push-selected`}
            style={{
              padding: '6px 14px',
              cursor: selected.size === 0 ? 'not-allowed' : 'pointer',
              opacity: selected.size === 0 ? 0.5 : 1,
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: 4,
            }}
          >
            <FormattedMessage id="editor.inheritance.propagate.push" />
          </button>
        </footer>
      </div>
    </div>
  );
}
