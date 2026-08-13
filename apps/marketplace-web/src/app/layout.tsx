import type { Metadata } from 'next';
import './globals.css';
import { LocaleProvider } from '@/hooks/useLocale';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';

export const metadata: Metadata = {
  title: 'Domio Marketplace',
  description: 'Components, templates, themes, and more — ready to use in your next project.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href={'https://fonts.googleapis.com'} />
        <link rel="preconnect" href={'https://fonts.gstatic.com'} crossOrigin="anonymous" />
        <link
          href={'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&display=swap'}
          rel="stylesheet"
        />
      </head>
      <body className="bg-bg text-fg font-body min-h-screen flex flex-col">
        <LocaleProvider>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </LocaleProvider>
      </body>
    </html>
  );
}
