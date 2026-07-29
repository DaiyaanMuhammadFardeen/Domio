import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Domio',
  description: 'Domio — Phase 0 stub landing',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
