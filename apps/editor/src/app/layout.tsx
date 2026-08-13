import type { Metadata } from 'next';
import './globals.css';
import { resolveLocaleFromHeaders } from '@domio/ui';
import { headers } from 'next/headers';

export const metadata: Metadata = {
  title: 'Domio editor',
  description: 'Domio editor — phase 0 boot',
};

/**
 * Resolve the active locale from the request headers and reflect it
 * on `<html lang>` and `<html dir>`. Falls back to en/ltr when no
 * preference is stored — matches the documented default in
 * @domio/i18n.
 *
 * Server-component because Next.js requires `<html>` to render in a
 * server context (no client-side useState).
 *
 * Per Wave 1 §S1.8 of docs/frontend-roadmap/01-wave-productionization.md.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const h = await headers();
  const cookie = h.get('cookie');
  const acceptLanguage = h.get('accept-language');
  const { lang, dir } = resolveLocaleFromHeaders({ cookie, acceptLanguage });
  return (
    <html lang={lang} dir={dir}>
      <body>{children}</body>
    </html>
  );
}
