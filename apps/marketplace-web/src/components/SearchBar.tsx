'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale } from '@/hooks/useLocale';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  /** Optional debounce in ms (defaults to 250). */
  debounceMs?: number;
  /** When true, mirrors the value to ?q=... on the current URL. */
  syncToUrl?: boolean;
}

export function SearchBar({
  value,
  onChange,
  debounceMs = 250,
  syncToUrl = false,
}: SearchBarProps) {
  const { t } = useLocale();
  const [local, setLocal] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstRender = useRef(true);

  // When external value changes (e.g. URL cleared), mirror to local.
  useEffect(() => {
    setLocal(value);
  }, [value]);

  // Debounced upstream propagation + URL sync.
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (local !== value) {
        onChange(local);
      }
      if (syncToUrl && typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        if (local) {
          url.searchParams.set('q', local);
        } else {
          url.searchParams.delete('q');
        }
        // Use replaceState to avoid bloating history.
        window.history.replaceState({}, '', url.toString());
      }
    }, debounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // We intentionally omit `value` from deps to debounce around rapid external updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local, debounceMs, syncToUrl]);

  // Skip the first render so we don't immediately rewrite the URL before hydration.
  useEffect(() => {
    firstRender.current = false;
  }, []);

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
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder={t('hero.searchPlaceholder')}
        className="w-full rounded-2xl border border-border bg-panel py-3.5 pl-12 pr-4 text-sm text-fg placeholder-muted transition-all focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/20"
        aria-label={t('hero.searchPlaceholder')}
        data-testid="search-input"
      />
    </div>
  );
}
