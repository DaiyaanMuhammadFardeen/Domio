import type { Metadata } from 'next';
import './globals.css';
import { Header } from '../components/Header';
import { Sidebar } from '../components/Sidebar';
import { resolveLocaleFromHeaders } from '@domio/ui';
import { headers } from 'next/headers';

export const metadata: Metadata = {
  title: 'Domio Admin Console',
  description: 'Marketplace admin — brand-lock curation, takedowns, trust scoring, payouts.',
};

/**
 * Resolve the active locale from the request headers and reflect it
 * on `<html lang>` and `<html dir>`. Falls back to en/ltr when no
 * preference is stored — matches the documented default in
 * @domio/i18n.
 *
 * Per Wave 1 §S1.8 of docs/frontend-roadmap/01-wave-productionization.md.
 */
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const h = await headers();
  const cookie = h.get('cookie');
  const acceptLanguage = h.get('accept-language');
  const { lang, dir } = resolveLocaleFromHeaders({ cookie, acceptLanguage });
  return (
    <html lang={lang} dir={dir}>
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
