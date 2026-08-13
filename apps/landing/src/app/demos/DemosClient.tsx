/**
 * DemosClient — interactive filter surface for the demo gallery.
 *
 * S12.6. The route page is server-rendered, but the filter chips need
 * client state, so this thin client wrapper renders the filter row plus
 * the filtered grid of `DemoTile`s.
 */

'use client';

import { useMemo, useState, type JSX } from 'react';
import { DEMOS, DEMO_TAGS, type DemoEntry } from '../../lib/demo-data';
import { DemoTile } from '../../components/demo/DemoTile';

export interface DemosClientProps {
  readonly heading: string;
  readonly intro: string;
  readonly openLabel: string;
  readonly allLabel: string;
  readonly emptyLabel: string;
}

function uniqueSorted(values: Iterable<string>): ReadonlyArray<string> {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

export function DemosClient({
  heading,
  intro,
  openLabel,
  allLabel,
  emptyLabel,
}: DemosClientProps): JSX.Element {
  const [active, setActive] = useState<string | null>(null);

  const availableTags = useMemo<ReadonlyArray<string>>(
    () => uniqueSorted(DEMO_TAGS),
    [],
  );

  const filtered: ReadonlyArray<DemoEntry> = useMemo(() => {
    if (active === null) return DEMOS;
    return DEMOS.filter((d) => d.tags.includes(active));
  }, [active]);

  return (
    <section className="demos" aria-labelledby="demos-heading">
      <header className="demos__header">
        <h1 id="demos-heading">{heading}</h1>
        <p>{intro}</p>
      </header>

      <div className="demos__filters" role="group" aria-label="Filter demos by tag">
        <button
          type="button"
          className={
            'demos__chip' + (active === null ? ' demos__chip--active' : '')
          }
          data-testid="demo-filter-chip"
          data-tag="__all__"
          aria-pressed={active === null}
          onClick={() => setActive(null)}
        >
          {allLabel}
        </button>
        {availableTags.map((tag) => (
          <button
            key={tag}
            type="button"
            className={
              'demos__chip' + (active === tag ? ' demos__chip--active' : '')
            }
            data-testid="demo-filter-chip"
            data-tag={tag}
            aria-pressed={active === tag}
            onClick={() => setActive((current) => (current === tag ? null : tag))}
          >
            {tag}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="demos__empty" data-testid="demos-empty">
          {emptyLabel}
        </p>
      ) : (
        <div className="demos__grid" data-testid="demos-grid">
          {filtered.map((demo) => (
            <DemoTile key={demo.id} demo={demo} openLabel={openLabel} />
          ))}
        </div>
      )}
    </section>
  );
}

export default DemosClient;