import type { Metadata } from 'next';
import './globals.css';
import { Header } from '../components/Header';
import { Sidebar } from '../components/Sidebar';
import { toHtmlDir, toHtmlLang, isLocaleId, DEFAULT_LOCALE } from '@domio/i18n';
import { headers } from 'next/headers';

export const metadata: Metadata = {
  title: 'Domio dashboard',
  description: 'Domio — analytics dashboard',
};

/**
 * Phase 22-beta G5: read the active locale from the `domio-locale`
 * cookie (set by the locale switcher in the dashboard header) and
 * reflect it on `<html lang>` and `<html dir>`. Falls back to en/ltr.
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
      <body className="bg-slate-50 text-slate-900 min-h-screen">
        <Header />
        <div className="flex">
          <Sidebar />
          <main className="flex-1 p-6 max-w-[1400px] mx-auto">{children}</main>
        </div>
      </body>
    </html>
  );
}
