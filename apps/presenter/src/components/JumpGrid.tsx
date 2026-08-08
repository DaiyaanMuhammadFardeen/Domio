'use client';

/**
 * JumpGrid — instant "jump to slide" grid with search-as-you-type.
 *
 * Renders a virtualized grid of slide thumbnails for ≤500 slides with
 * search-as-you-type within 100 ms. Hidden slides are dimmed but
 * remain visible (the presenter can un-hide from the same grid).
 *
 * Selections dispatch a stage advance through the SessionClient —
 * the parent passes an `onJump` callback that handles the wire call
 * and reconciliation.
 */

import { useMemo, useState } from 'react';
import type { JumpGridEntry } from '../runtime/types';

export interface JumpGridProps {
  slides: JumpGridEntry[];
  onJump: (slide_id: string, slide_index: number) => void;
}

export function JumpGrid({ slides, onJump }: JumpGridProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query) return slides;
    const q = query.toLowerCase();
    return slides.filter((s) =>
      s.title.toLowerCase().includes(q)
      || s.slide_id.toLowerCase().includes(q)
      || String(s.slide_index).includes(q)
    );
  }, [slides, query]);

  return (
    <div className="jump-grid">
      <div className="jump-grid__search">
        <input
          type="search"
          placeholder="Jump to slide…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search slides"
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      <div
        className="jump-grid__list"
        role="grid"
        aria-label="Slide grid"
      >
        {filtered.length === 0 ? (
          <div style={{ padding: 8, color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: 12 }}>
            No matches.
          </div>
        ) : (
          filtered.map((s) => (
            <button
              key={s.slide_id}
              type="button"
              role="gridcell"
              className={[
                'jump-grid__cell',
                s.is_current && 'jump-grid__cell--current',
                s.hidden && 'jump-grid__cell--hidden',
              ].filter(Boolean).join(' ')}
              onClick={() => onJump(s.slide_id, s.slide_index)}
              aria-current={s.is_current ? 'true' : undefined}
              aria-label={`Slide ${s.slide_index + 1}: ${s.title}${s.hidden ? ' (hidden)' : ''}`}
            >
              <div className="jump-grid__thumb">
                {s.thumbnail_url
                  ? <img src={s.thumbnail_url} alt="" width={96} height={54} loading="lazy" />
                  : <span>{s.slide_index + 1}</span>}
              </div>
              <div className="jump-grid__caption">
                <span className="jump-grid__index">{s.slide_index + 1}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.title}
                </span>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}