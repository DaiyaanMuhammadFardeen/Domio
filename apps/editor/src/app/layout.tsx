import type { Metadata } from 'next';
import './globals.css';
import { toHtmlDir, toHtmlLang, isLocaleId, DEFAULT_LOCALE } from '@domio/i18n';
import { headers } from 'next/headers';

export const metadata: Metadata = {
  title: 'Domio editor',
  description: 'Domio editor — phase 0 boot',
};

/**
 * Phase 22-beta G5: read the active locale from the `domio-locale`
 * cookie (set by the locale switcher in the editor topbar) and reflect
 * it on `<html lang>` and `<html dir>`. Falls back to en/ltr when no
 * preference is stored — matches the documented default in
 * @domio/i18n.
 *
 * Server-component because Next.js requires `<html>` to render in a
 * server context (no client-side useState).
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieHeader = (await headers()).get('cookie') ?? '';
  const match = /(?:^|;\s*)domio-locale=([^;]+)/.exec(cookieHeader);
  const raw = match ? decodeURIComponent(match[1] ?? '') : '';
  const locale = isLocaleId(raw) ? raw : DEFAULT_LOCALE;
  return (
    <html lang={toHtmlLang(locale)} dir={toHtmlDir(locale)}>
      <body>{children}</body>
    </html>
  );
}