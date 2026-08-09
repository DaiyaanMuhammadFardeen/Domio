'use client';

import Link from 'next/link';
import { useLocale } from '@/hooks/useLocale';
import { LOCALES, type LocaleId } from '@/lib/i18n';

const LOCALE_LABELS: Record<LocaleId, string> = {
  en: 'EN',
  bn: 'বাং',
  es: 'ES',
  fr: 'FR',
  de: 'DE',
  ja: 'JA',
  'zh-CN': '中',
};

export function Header() {
  const { locale, setLocale, t } = useLocale();

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-bg/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo + nav */}
        <div className="flex items-center gap-8">
          <Link
            href="/"
            className="font-display text-lg font-bold tracking-tight text-fg transition-opacity hover:opacity-80"
            aria-label="Domio Marketplace — Home"
          >
            <span className="text-accent">Domio</span>{' '}
            <span className="text-muted">Marketplace</span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex" aria-label="Main navigation">
            <Link
              href="/"
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-panel hover:text-fg"
            >
              {t('nav.browse')}
            </Link>
          </nav>
        </div>

        {/* Right side — locale picker */}
        <div className="flex items-center gap-3">
          <div className="relative" role="group" aria-label="Language selector">
            <select
              value={locale}
              onChange={(e) => setLocale(e.target.value as LocaleId)}
              className="appearance-none rounded-lg border border-border bg-panel px-3 py-1.5 pr-8 text-xs font-medium text-fg transition-colors hover:border-accent/40 focus:border-accent focus:outline-none"
              aria-label="Select language"
            >
              {LOCALES.map((l) => (
                <option key={l} value={l}>
                  {LOCALE_LABELS[l]}
                </option>
              ))}
            </select>
            <svg
              className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </div>
    </header>
  );
}
