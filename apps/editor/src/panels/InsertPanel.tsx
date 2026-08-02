/**
 * InsertPanel — Insert → Components (P06 WS-COM-2 + #23).
 * Search + category browse over the curated component catalog with
 * live SVG previews; inserting places a `component` layer on the slide.
 */

'use client';

import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { listComponents, type DomioComponentDef } from '@domio/components';
import { MagicCard } from '../components/ui/magic-card';
import { Marquee } from '../components/ui/marquee';
import { ComponentThumb } from '../components/ComponentThumb';

interface InsertPanelProps {
  onInsert: (catalogId: string) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  statistics: 'Stats',
  data: 'Data',
  structure: 'Structure',
  people: 'People',
  layout: 'Layout',
};

export function InsertPanel({ onInsert }: InsertPanelProps): ReactElement {
  const all = useMemo(() => listComponents(), []);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('all');

  const categories = useMemo(() => {
    const seen = new Set<string>();
    for (const c of all) seen.add(c.category);
    return [...seen];
  }, [all]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((c) => {
      if (category !== 'all' && c.category !== category) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.catalogId.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q)
      );
    });
  }, [all, query, category]);

  const marqueeItems = useMemo(
    () => all.slice(0, 12).map((c) => c.name),
    [all],
  );

  return (
    <section className="insert-panel" data-testid="insert-panel">
      <header className="insert-panel__header">
        <h2 className="insert-panel__title">Insert</h2>
        <p className="insert-panel__sub">{all.length} components</p>
      </header>

      <Marquee className="insert-panel__marquee" pauseOnHover>
        {marqueeItems.map((name) => (
          <span key={name} className="insert-panel__marquee-item">
            {name}
          </span>
        ))}
      </Marquee>

      <input
        type="search"
        className="insert-panel__search"
        placeholder="Search components…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search components"
      />

      <div className="insert-panel__cats" role="tablist" aria-label="Category">
        <button
          type="button"
          role="tab"
          aria-selected={category === 'all'}
          className={`insert-panel__cat${category === 'all' ? ' is-active' : ''}`}
          onClick={() => setCategory('all')}
        >
          All
        </button>
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            role="tab"
            aria-selected={category === c}
            className={`insert-panel__cat${category === c ? ' is-active' : ''}`}
            onClick={() => setCategory(c)}
          >
            {CATEGORY_LABELS[c] ?? c}
          </button>
        ))}
      </div>

      <div className="insert-panel__grid" data-testid="insert-grid">
        {filtered.map((def) => (
          <InsertCard key={def.catalogId} def={def} onInsert={() => onInsert(def.catalogId)} />
        ))}
        {filtered.length === 0 ? (
          <div className="insert-panel__empty">No components match “{query}”.</div>
        ) : null}
      </div>
    </section>
  );
}

function InsertCard({ def, onInsert }: { def: DomioComponentDef; onInsert: () => void }): ReactElement {
  return (
    <MagicCard className="insert-card">
      <button type="button" className="insert-card__insert" onClick={onInsert}>
        <span className="insert-card__thumb">
          <ComponentThumb def={def} />
        </span>
        <span className="insert-card__meta">
          <span className="insert-card__name">{def.name}</span>
          <span className="insert-card__cat">{CATEGORY_LABELS[def.category] ?? def.category}</span>
        </span>
        <span className="insert-card__action">Insert</span>
      </button>
    </MagicCard>
  );
}
