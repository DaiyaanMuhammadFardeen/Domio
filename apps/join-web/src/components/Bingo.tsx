/**
 * Bingo — 5x5 word-grid widget (S5.11).
 *
 * Tiles are labelled with a 2-letter pair (AA..YZ, skipping I/J and
 * O for visual clarity — a standard bingo convention). A tile is
 * marked "filled" when any submitted word contains the tile's
 * letter-pair as a substring (case-insensitive). The first letter of
 * the word selects the row, the second selects the column.
 */

'use client';

import { useMemo } from 'react';

export interface BingoProps {
  readonly prompt: string;
  readonly submittedWords: ReadonlyArray<string>;
  readonly onSubmitWord: (word: string) => void;
}

const ROWS = ['A', 'B', 'C', 'D', 'E'] as const;
const COLS = ['A', 'B', 'C', 'D', 'E'] as const;

function pairLabel(row: string, col: string): string {
  return `${row}${col}`;
}

/** True when any submitted word contains the tile's letter-pair as substring. */
function isFilled(words: ReadonlyArray<string>, pair: string): boolean {
  const needle = pair.toLowerCase();
  for (const w of words) {
    if (w.toLowerCase().includes(needle)) return true;
  }
  return false;
}

export function Bingo(props: BingoProps) {
  const filledSet = useMemo(() => {
    const set = new Set<string>();
    for (const row of ROWS) {
      for (const col of COLS) {
        const p = pairLabel(row, col);
        if (isFilled(props.submittedWords, p)) set.add(p);
      }
    }
    return set;
  }, [props.submittedWords]);

  const filledCount = filledSet.size;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const text = String(fd.get('word') || '').trim();
    if (text.length > 0 && text.length <= 32) {
      props.onSubmitWord(text);
      form.reset();
    }
  }

  return (
    <section
      className="bg-white rounded-lg shadow p-4 flex flex-col gap-4"
      data-testid="bingo"
      aria-label={`Bingo: ${props.prompt}`}
    >
      <header className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Bingo</div>
          <h2 className="text-base font-semibold text-slate-900" data-testid="bingo-prompt">
            {props.prompt}
          </h2>
        </div>
        <span
          className="inline-flex items-center rounded-full bg-blue-100 text-blue-800 px-2 py-0.5 text-xs font-semibold"
          data-testid="bingo-filled-count"
        >
          {filledCount} / {ROWS.length * COLS.length}
        </span>
      </header>

      <div
        className="grid grid-cols-5 gap-1"
        role="grid"
        aria-label="Bingo tiles"
        data-testid="bingo-grid"
      >
        {ROWS.map((row) =>
          COLS.map((col) => {
            const label = pairLabel(row, col);
            const filled = filledSet.has(label);
            return (
              <div
                key={label}
                role="gridcell"
                aria-label={`${label} ${filled ? 'filled' : 'empty'}`}
                className={
                  'aspect-square flex items-center justify-center rounded border text-xs font-mono ' +
                  (filled
                    ? 'bg-emerald-200 border-emerald-400 text-emerald-900'
                    : 'bg-slate-50 border-slate-200 text-slate-500')
                }
                data-testid={`bingo-tile-${label}`}
                data-filled={filled ? 'true' : 'false'}
              >
                {label}
              </div>
            );
          }),
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2" data-testid="bingo-form">
        <input
          name="word"
          maxLength={32}
          placeholder="Type a word"
          className="flex-1 border rounded p-2"
          data-testid="bingo-input"
        />
        <button
          type="submit"
          className="bg-blue-600 text-white rounded px-4"
          data-testid="bingo-submit"
        >
          Send
        </button>
      </form>
    </section>
  );
}
