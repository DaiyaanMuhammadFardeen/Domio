'use client';

/**
 * HistoryPanel — scrubbable undo/redo timeline. See
 * docs/development_phases/phase-03 §E.1 (History panel + scrub).
 *
 * Renders one entry per op with an optional thumbnail. Click jumps to
 * the document state at that entry; `Cmd+Z` / `Cmd+Shift+Z` are wired
 * by the caller via `onUndo` / `onRedo`.
 */

import { useState } from 'react';
import type { ReactElement } from 'react';
import type { HistoryEntry, HistoryOp } from '@domio/canvas';

export interface HistoryPanelProps {
  past: ReadonlyArray<HistoryEntry>;
  future: ReadonlyArray<HistoryEntry>;
  onUndo: () => void;
  onRedo: () => void;
  onScrub: (index: number) => void;
}

export function HistoryPanel(props: HistoryPanelProps): ReactElement {
  const { past, future, onUndo, onRedo, onScrub } = props;
  const [scrubIndex, setScrubIndex] = useState<number | null>(null);

  const total = past.length + future.length;
  const redoCount = future.length;

  return (
    <section className="history" aria-label="History">
      <header className="history__header">
        <button
          type="button"
          className="history__btn"
          onClick={onUndo}
          disabled={past.length === 0}
          aria-label="Undo"
        >
          Undo
        </button>
        <button
          type="button"
          className="history__btn"
          onClick={onRedo}
          disabled={future.length === 0}
          aria-label="Redo"
        >
          Redo
        </button>
        <span className="history__counts">
          {past.length} past · {future.length} future
        </span>
      </header>
      <ol className="history__list">
        {past.map((entry, i) => {
          const index = past.length - i;
          const absolute = i;
          const isActive = scrubIndex === absolute;
          return (
            <li key={entry.op.id} className={`history__entry${isActive ? ' is-active' : ''}`}>
              <button
                type="button"
                onMouseEnter={() => setScrubIndex(absolute)}
                onMouseLeave={() => setScrubIndex(null)}
                onFocus={() => setScrubIndex(absolute)}
                onBlur={() => setScrubIndex(null)}
                onClick={() => onScrub(absolute)}
              >
                {entry.op.thumbnail ? (
                  <img src={entry.op.thumbnail} alt="" className="history__thumb" />
                ) : null}
                <span className="history__name">{describeOp(entry.op)}</span>
                <span className="history__index">
                  {index}/{total}
                </span>
              </button>
            </li>
          );
        })}
        {future.map((entry, i) => (
          <li key={entry.op.id} className="history__entry history__entry--future">
            <span className="history__name">{describeOp(entry.op)}</span>
            <span className="history__index">
              {redoCount - i}/{total}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function describeOp(op: HistoryOp): string {
  return op.name
    .replace(/Op$/, '')
    .replace(/([A-Z])/g, ' $1')
    .trim();
}
