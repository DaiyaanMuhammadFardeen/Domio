import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Domio viewer',
  description:
    'Domio viewer — read-only playback for shared decks, live sessions, and embedded presentations.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
