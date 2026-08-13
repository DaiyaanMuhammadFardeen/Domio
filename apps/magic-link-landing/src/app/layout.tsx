import type { Metadata } from 'next';
import './globals.css';
import { AppNav } from '@domio/ui';

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
      <body>
        <AppNav activeSurface="magicLinkLanding" currentPath="/" brandHref="/" />
        {children}
      </body>
    </html>
  );
}
