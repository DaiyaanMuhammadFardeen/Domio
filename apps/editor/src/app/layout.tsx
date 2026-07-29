import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Domio editor',
  description: 'Domio editor — phase 0 boot',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}