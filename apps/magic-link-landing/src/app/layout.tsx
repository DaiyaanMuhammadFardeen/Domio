import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Domio — Guest Access',
  description: 'Your invitation to collaborate on Domio.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
