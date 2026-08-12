import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Domio',
  description: 'Domio — interactive decks, shared sessions, and live presentations.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
