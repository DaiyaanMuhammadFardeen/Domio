import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'Join a Domio session',
  description: 'Scan, join, vote.',
  manifest: '/manifest.webmanifest',
  // PWA theme color: PWA chrome requires a literal hex string; the
  // design-token CSS variable is not resolved here. The value mirrors
  // var(--surface-base) (#0f172a) defined in packages/ui/tokens.css.
  themeColor: '0f172a',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
