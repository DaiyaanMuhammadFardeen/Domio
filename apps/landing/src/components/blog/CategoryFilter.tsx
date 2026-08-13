/**
 * CategoryFilter — chip-style filter for the blog index.
 *
 * Wave 12 §S12.10 — Blog. Renders one chip per category plus an
 * "All" chip. The selected chip is highlighted and the whole strip
 * is keyboard accessible.
 */

'use client';

import type { JSX } from 'react';
import {
  BLOG_CATEGORIES,
  BLOG_CATEGORY_LABELS,
  type BlogCategory,
} from '../../lib/blog-data';

export interface CategoryFilterProps {
  readonly selected: BlogCategory | 'all';
  readonly onSelect: (next: BlogCategory | 'all') => void;
}

interface ChipSpec {
  readonly value: BlogCategory | 'all';
  readonly label: string;
}

const CHIPS: ReadonlyArray<ChipSpec> = [
  { value: 'all', label: 'All' },
  ...BLOG_CATEGORIES.map((c) => ({ value: c, label: BLOG_CATEGORY_LABELS[c] })),
];

export function CategoryFilter({
  selected,
  onSelect,
}: CategoryFilterProps): JSX.Element {
  return (
    <div
      className="blog-filter"
      role="tablist"
      aria-label="Filter posts by category"
    >
      {CHIPS.map((chip) => {
        const active = chip.value === selected;
        return (
          <button
            key={chip.value}
            type="button"
            role="tab"
            aria-selected={active}
            className={'blog-filter__chip' + (active ? ' blog-filter__chip--active' : '')}
            onClick={() => onSelect(chip.value)}
            data-testid={`blog-filter-chip-${chip.value}`}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}

export default CategoryFilter;
