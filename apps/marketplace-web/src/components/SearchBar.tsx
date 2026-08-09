'use client';

import { useLocale } from '@/hooks/useLocale';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export function SearchBar({ value, onChange }: SearchBarProps) {
  const { t } = useLocale();

  return (
    <div className="relative w-full">
      {/* Search icon */}
      <svg
        className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
      </svg>

      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('hero.searchPlaceholder')}
        className="w-full rounded-2xl border border-border bg-panel py-3.5 pl-12 pr-4 text-sm text-fg placeholder-muted transition-all focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/20"
        aria-label={t('hero.searchPlaceholder')}
      />
    </div>
  );
}
