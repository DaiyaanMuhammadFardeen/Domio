import type { Metadata } from 'next';
import type { JSX } from 'react';
import SiteHeader from '../components/layout/SiteHeader';
import SiteFooter from '../components/layout/SiteFooter';
import './globals.css';

export const metadata: Metadata = {
  title: 'Domio',
  description: 'Domio — interactive decks, shared sessions, and live presentations.',
};

export default function RootLayout({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <html lang="en">
      <body>
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}