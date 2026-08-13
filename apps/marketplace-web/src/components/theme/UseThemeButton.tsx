'use client';

import { useCallback } from 'react';
import { useLocale } from '@/hooks/useLocale';
// The editor() builder does not yet accept a `theme` parameter, so we open
// the new-deck editor without it. Once editor() grows a theme option, this
// becomes `editor('__new__', { theme: themeId })`.
import { editor } from '@domio/ui/routing';

export interface UseThemeButtonProps {
  themeId: string;
  slug: string;
  variant?: 'primary' | 'secondary';
}

export function UseThemeButton({ themeId, slug, variant = 'primary' }: UseThemeButtonProps) {
  const { t } = useLocale();

  const handleClick = useCallback(() => {
    const url = editor('__new__');
    if (typeof window === 'undefined') return;
    // Tag the URL so the editor can pick the theme up if it supports the
    // query parameter. The signature is a recognised contract for when
    // editor() gains a `theme` option.
    const finalUrl = `${url}${url.includes('?') ? '&' : '?'}theme=${encodeURIComponent(themeId)}`;
    window.open(finalUrl, '_blank', 'noopener,noreferrer');
    // slug is intentionally part of the public API for future tracking.
    void slug;
  }, [themeId, slug]);

  const className =
    variant === 'primary'
      ? 'w-full rounded-xl bg-accent py-3.5 text-sm font-semibold text-white transition-all hover:opacity-90'
      : 'w-full rounded-xl border border-border bg-panel py-3.5 text-sm font-semibold text-fg transition-all hover:border-accent';

  return (
    <button type="button" onClick={handleClick} data-testid="theme-use-cta" className={className}>
      {t('market.theme.useTheme')}
    </button>
  );
}
