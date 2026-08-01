'use client';

/**
 * LayersPanel — searchable / filterable / drag-reorderable layer list.
 * See docs/development_phases/phase-03 §F.2 (Layer list, search, drag).
 *
 * Renders one row per element in the active slide, top z at the top of the
 * list. Selection is a pure `Set<ULID>`; reordering dispatches a
 * `ReorderOp` via the supplied callback.
 */

import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import type { Element, Slide, ULID } from '@domio/schema';

export interface LayersPanelProps {
  slide: Slide;
  selectedIds: ReadonlySet<ULID>;
  onSelect: (id: ULID, modifiers: { shift: boolean; alt: boolean }) => void;
  onReorder: (sourceId: ULID, targetId: ULID, place: 'before' | 'after') => void;
  onToggleFlag: (id: ULID, flag: 'locked' | 'hidden') => void;
}

export function LayersPanel(props: LayersPanelProps): ReactElement {
  const { slide, selectedIds, onSelect, onReorder, onToggleFlag } = props;
  const [query, setQuery] = useState('');
  const [showHidden, setShowHidden] = useState(false);
  const [dragSource, setDragSource] = useState<ULID | null>(null);

  const rows = useMemo(() => {
    const sorted = [...slide.elements].sort((a, b) => (b.z ?? 0) - (a.z ?? 0));
    return sorted.filter((el) => {
      if (!showHidden && el.hidden) return false;
      if (!query) return true;
      const q = query.toLowerCase();
      return (
        el.name.toLowerCase().includes(q) ||
        el.type.toLowerCase().includes(q) ||
        el.semanticId.toLowerCase().includes(q)
      );
    });
  }, [slide.elements, query, showHidden]);

  return (
    <section className="layers" aria-label="Layers">
      <header className="layers__header">
        <input
          className="layers__search"
          type="search"
          placeholder="Search layers"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search layers"
        />
        <label className="layers__show-hidden">
          <input
            type="checkbox"
            checked={showHidden}
            onChange={(e) => setShowHidden(e.target.checked)}
          />
          Show hidden
        </label>
      </header>
      <ul className="layers__list" role="listbox" aria-label="Layer list">
        {rows.map((el) => (
          <li
            key={el.id}
            className={`layers__row${selectedIds.has(el.id) ? ' is-selected' : ''}`}
            draggable
            onDragStart={() => setDragSource(el.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              if (!dragSource || dragSource === el.id) return;
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              const place = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
              onReorder(dragSource, el.id, place);
              setDragSource(null);
            }}
          >
            <button
              className="layers__row-main"
              onClick={(e) => onSelect(el.id, { shift: e.shiftKey, alt: e.altKey })}
              type="button"
            >
              <span className={`layers__type layers__type--${el.type}`}>{el.type}</span>
              <span className="layers__name">{el.name}</span>
              {el.locked ? <span className="layers__badge">locked</span> : null}
              {el.hidden ? <span className="layers__badge">hidden</span> : null}
            </button>
            <span className="layers__row-actions">
              <button
                type="button"
                onClick={() => onToggleFlag(el.id, 'locked')}
                aria-label="Toggle lock"
                aria-pressed={el.locked === true}
              >
                {el.locked ? '🔒' : '🔓'}
              </button>
              <button
                type="button"
                onClick={() => onToggleFlag(el.id, 'hidden')}
                aria-label="Toggle hide"
                aria-pressed={el.hidden === true}
              >
                {el.hidden ? '◉' : '◌'}
              </button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export interface FlatElementRow {
  id: ULID;
  name: string;
  type: Element['type'];
  visible: boolean;
  locked: boolean;
}

export function buildRows(slide: Slide, opts: { showHidden: boolean }): FlatElementRow[] {
  return [...slide.elements]
    .sort((a, b) => (b.z ?? 0) - (a.z ?? 0))
    .filter((el) => opts.showHidden || !el.hidden)
    .map((el) => ({
      id: el.id,
      name: el.name,
      type: el.type,
      visible: !el.hidden,
      locked: el.locked === true,
    }));
}