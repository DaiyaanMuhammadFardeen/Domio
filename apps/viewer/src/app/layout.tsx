import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Domio viewer',
  description: 'Domio viewer — Phase 0 stub',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
