/**
 * Category filter for the changelog page.
 *
 * Wave 12 §S12.5 — small client component that toggles which
 * categories of release notes are visible. Three categories map
 * directly onto the entry shape:
 *   - feature  → entries with non-empty `highlights`
 *   - fix      → entries with non-empty `fixes`
 *   - breaking → entries with non-empty `breaking_changes`
 *
 * The "all" chip is the default and is mutually exclusive with the
 * category chips. The component is purely presentational — it raises
 * `onChange` with the next filter set and lets the parent drive the
 * render.
 */

'use client';

import type { JSX } from 'react';

export type ChangelogCategory = 'feature' | 'fix' | 'breaking';

export type ChangelogFilter = 'all' | ReadonlySet<ChangelogCategory>;

export interface ReleaseFilterProps {
  readonly value: ChangelogFilter;
  readonly onChange: (next: ChangelogFilter) => void;
  readonly featureCount: number;
  readonly fixCount: number;
  readonly breakingCount: number;
}

interface ChipSpec {
  readonly id: ChangelogCategory | 'all';
  readonly label: string;
}

const CHIPS: ReadonlyArray<ChipSpec> = [
  { id: 'all', label: 'All' },
  { id: 'feature', label: 'Features' },
  { id: 'fix', label: 'Fixes' },
  { id: 'breaking', label: 'Breaking' },
];

function countFor(
  id: ChangelogCategory | 'all',
  featureCount: number,
  fixCount: number,
  breakingCount: number,
): number {
  switch (id) {
    case 'all':
      return featureCount + fixCount + breakingCount;
    case 'feature':
      return featureCount;
    case 'fix':
      return fixCount;
    case 'breaking':
      return breakingCount;
  }
}

function isActive(id: ChangelogCategory | 'all', value: ChangelogFilter): boolean {
  if (id === 'all') return value === 'all';
  if (value === 'all') return false;
  return value.has(id);
}

export function ReleaseFilter({
  value,
  onChange,
  featureCount,
  fixCount,
  breakingCount,
}: ReleaseFilterProps): JSX.Element {
  const handleClick = (id: ChangelogCategory | 'all'): void => {
    if (id === 'all') {
      onChange('all');
      return;
    }
    // Start from a fresh set on every click so the chips behave like
    // radio toggles (rather than accumulating) — this matches the
    // "one filter at a time" mental model and keeps the parent simple.
    if (value === 'all') {
      onChange(new Set<ChangelogCategory>([id]));
      return;
    }
    // Clicking the already-active chip clears the filter back to "all".
    if (value.has(id)) {
      onChange('all');
      return;
    }
    onChange(new Set<ChangelogCategory>([id]));
  };

  return (
    <div
      className="cl-filter"
      role="toolbar"
      aria-label="Filter changelog by category"
      data-testid="changelog-filter"
    >
      {CHIPS.map((chip) => {
        const active = isActive(chip.id, value);
        const count = countFor(chip.id, featureCount, fixCount, breakingCount);
        return (
          <button
            key={chip.id}
            type="button"
            className={'cl-filter__chip' + (active ? ' cl-filter__chip--active' : '')}
            aria-pressed={active}
            data-testid={`changelog-filter-${chip.id}`}
            onClick={() => handleClick(chip.id)}
          >
            <span className="cl-filter__label">{chip.label}</span>
            <span className="cl-filter__count" aria-hidden="true">
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default ReleaseFilter;
