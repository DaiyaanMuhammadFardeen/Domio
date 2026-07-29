import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Domio presenter',
  description: 'Domio presenter — Phase 0 stub',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
