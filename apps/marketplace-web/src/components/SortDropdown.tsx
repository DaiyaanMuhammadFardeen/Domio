'use client';

import { useLocale } from '@/hooks/useLocale';
import type { SearchSort } from '@/lib/types';

interface SortDropdownProps {
  value: SearchSort;
  onChange: (sort: SearchSort) => void;
}

const SORT_OPTIONS: ReadonlyArray<{ value: SearchSort; labelKey: string }> = [
  { value: 'relevance', labelKey: 'market.search.sort.relevance' },
  { value: 'newest', labelKey: 'market.search.sort.newest' },
  { value: 'top-rated', labelKey: 'market.search.sort.topRated' },
  { value: 'most-downloaded', labelKey: 'market.search.sort.mostDownloaded' },
  { value: 'price-asc', labelKey: 'market.search.sort.priceAsc' },
  { value: 'price-desc', labelKey: 'market.search.sort.priceDesc' },
];

export function SortDropdown({ value, onChange }: SortDropdownProps) {
  const { t } = useLocale();

  return (
    <label className="flex items-center gap-2 text-xs text-muted">
      <span className="sr-only">Sort</span>
      <select
        data-testid="sort-dropdown"
        value={value}
        onChange={(e) => onChange(e.target.value as SearchSort)}
        className="rounded-lg border border-border bg-panel px-3 py-1.5 text-xs font-medium text-fg transition-colors hover:border-accent/40 focus:border-accent focus:outline-none"
      >
        {SORT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {t(opt.labelKey)}
          </option>
        ))}
      </select>
    </label>
  );
}
