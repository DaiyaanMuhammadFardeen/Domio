import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'Join a Domio session',
  description: 'Scan, join, vote.',
  manifest: '/manifest.webmanifest',
  themeColor: '#0f172a',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}