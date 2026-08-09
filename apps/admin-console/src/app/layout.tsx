import type { Metadata } from 'next';
import './globals.css';
import { Header } from '../components/Header';
import { Sidebar } from '../components/Sidebar';

export const metadata: Metadata = {
  title: 'Domio Admin Console',
  description: 'Marketplace admin — brand-lock curation, takedowns, trust scoring, payouts.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900 min-h-screen">
        <Header />
        <div className="flex">
          <Sidebar />
          <main className="flex-1 p-6 max-w-[1400px] mx-auto">{children}</main>
        </div>
      </body>
    </html>
  );
}
