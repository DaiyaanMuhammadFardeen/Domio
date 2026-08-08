import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Domio presenter',
  description: 'Phase 15 W2 — Presenter view shell',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
