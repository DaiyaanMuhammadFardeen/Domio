'use client';

import { use, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { marketplaceWeb } from '@domio/ui/routing';
import { useLocale } from '@/hooks/useLocale';
import { getTheme, listThemeSlugs, type ThemeListing } from '@/lib/theme-service';
import { ThemePreviewCanvas, TokenSwatches, UseThemeButton } from '@/components/theme';

interface ThemePageProps {
  params: Promise<{ slug: string }>;
}

const INCLUDED_ITEMS: ReadonlyArray<string> = [
  'Token set: colors, fonts, spacing',
  'Editor preset (auto-applied on new deck)',
  'Sample deck (3 starter slides)',
  'Light + dark variants',
];

export default function ThemePreviewPage({ params }: ThemePageProps) {
  const { slug } = use(params);
  const { t, formatPrice } = useLocale();

  const [theme, setTheme] = useState<ThemeListing | null>(null);
  const [related, setRelated] = useState<ThemeListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setNotFound(false);
      const result = await getTheme(slug);
      if (cancelled) return;
      if (!result) {
        setNotFound(true);
        setTheme(null);
      } else {
        setTheme(result);
      }
      const slugs = await listThemeSlugs();
      if (cancelled) return;
      const others = slugs.filter((s) => s !== slug).slice(0, 4);
      const relatedData = await Promise.all(others.map((s) => getTheme(s)));
      if (cancelled) return;
      setRelated(relatedData.filter((r): r is ThemeListing => r !== null));
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const posterStyle = useMemo<React.CSSProperties | null>(() => {
    if (!theme) return null;
    return {
      background: `linear-gradient(135deg, ${theme.tokens.color.primary}, ${theme.tokens.color.accent})`,
    };
  }, [theme]);

  if (loading) {
    return (
      <div
        className="mx-auto max-w-5xl px-4 py-16"
        data-testid="theme-loading"
      >
        <p className="text-sm text-muted">{t('market.theme.loadingPreview')}</p>
      </div>
    );
  }

  if (notFound || !theme) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16" data-testid="theme-not-found">
        <h1 className="font-display text-2xl font-bold text-fg">
          {t('market.theme.notFound')}
        </h1>
        <p className="mt-2 text-sm text-muted">
          <Link
            href={marketplaceWeb('home')}
            className="text-accent hover:underline"
          >
            {t('detail.backToBrowse')}
          </Link>
        </p>
      </div>
    );
  }

  const priceText = formatPrice(theme.price_cents, theme.currency, theme.is_free);

  return (
    <div
      className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8"
      data-testid="theme-preview-page"
    >
      <nav className="mb-8" aria-label="Breadcrumb">
        <Link
          href={marketplaceWeb('home')}
          className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-fg"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 19l-7-7 7-7"
            />
          </svg>
          {t('detail.backToBrowse')}
        </Link>
      </nav>

      <h1 className="mb-2 font-display text-3xl font-bold text-fg" data-testid="theme-title">
        {t('market.theme.heading')}: {theme.title}
      </h1>

      <div className="grid gap-10 lg:grid-cols-[1fr,1.4fr]">
        {/* Left: poster + tagline + CTA + price */}
        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start" data-testid="theme-hero">
          <div
            className="aspect-[4/3] overflow-hidden rounded-2xl border border-border"
            style={posterStyle ?? undefined}
            aria-label={`${theme.title} poster`}
          >
            <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center">
              <span
                className="rounded-md bg-black/30 px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-white"
                style={{ fontFamily: theme.tokens.fontFamily.heading }}
              >
                Theme
              </span>
              <p
                className="mt-4 font-display text-3xl font-bold text-white"
                style={{ fontFamily: theme.tokens.fontFamily.heading }}
              >
                {theme.title}
              </p>
            </div>
          </div>

          <div>
            <p
              className="text-sm leading-relaxed text-fg/80"
              style={{ fontFamily: theme.tokens.fontFamily.body }}
            >
              {theme.description}
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-panel p-6">
            <p
              className={`font-display text-2xl font-bold ${
                theme.is_free ? 'text-success' : 'text-fg'
              }`}
              data-testid="theme-price"
            >
              {priceText}
            </p>
            <div className="mt-4">
              <UseThemeButton themeId={theme.id} slug={theme.slug} />
            </div>
            {theme.tags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {theme.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-md bg-bg px-2 py-0.5 text-[11px] font-medium text-muted"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Right: live preview + token swatches */}
        <div className="space-y-10">
          <section data-testid="theme-preview-section">
            <h2 className="mb-4 font-display text-xl font-bold text-fg">
              {t('market.theme.preview')}
            </h2>
            <ThemePreviewCanvas tokens={theme.tokens} />
          </section>

          <section data-testid="theme-tokens-section">
            <h2 className="mb-4 font-display text-xl font-bold text-fg">
              {t('market.theme.tokens')}
            </h2>
            <TokenSwatches tokens={theme.tokens} />
          </section>
        </div>
      </div>

      {/* Below the fold: included + related */}
      <section
        className="mt-16 border-t border-border pt-12"
        data-testid="theme-included"
      >
        <h2 className="mb-4 font-display text-xl font-bold text-fg">
          {t('market.theme.included')}
        </h2>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {INCLUDED_ITEMS.map((item) => (
            <li
              key={item}
              className="flex items-start gap-3 rounded-xl border border-border bg-panel p-4 text-sm text-fg"
            >
              <svg
                className="mt-0.5 h-4 w-4 text-accent"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      {related.length > 0 && (
        <section
          className="mt-16 border-t border-border pt-12"
          data-testid="theme-related"
        >
          <h2 className="mb-4 font-display text-xl font-bold text-fg">
            {t('market.theme.relatedThemes')}
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {related.map((r) => (
              <Link
                key={r.slug}
                href={marketplaceWeb('theme', { slug: r.slug })}
                className="group overflow-hidden rounded-2xl border border-border bg-panel transition-all hover:border-accent/40"
              >
                <div
                  className="aspect-[4/3] w-full"
                  style={{
                    background: `linear-gradient(135deg, ${r.tokens.color.primary}, ${r.tokens.color.accent})`,
                  }}
                  aria-hidden="true"
                />
                <div className="p-3">
                  <p
                    className="font-display text-sm font-semibold text-fg group-hover:text-accent"
                    style={{ fontFamily: r.tokens.fontFamily.heading }}
                  >
                    {r.title}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] text-muted">
                    {r.is_free ? 'Free' : `${r.tokens.color.bg}`}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
