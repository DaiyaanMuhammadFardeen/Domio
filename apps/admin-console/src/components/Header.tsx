import Link from 'next/link';

const NAV_ITEMS: ReadonlyArray<{ href: string; label: string }> = [
  { href: '/', label: 'Overview' },
  { href: '/brand-locks', label: 'Brand Locks' },
  { href: '/takedowns', label: 'Takedowns' },
  { href: '/trust', label: 'Trust' },
  { href: '/payouts', label: 'Payouts' },
];

export function Header() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-6 px-6 py-3">
        <Link href="/" className="flex items-center gap-2">
          <span className="inline-block h-7 w-7 rounded-md bg-brand-600" aria-hidden />
          <span className="text-lg font-semibold tracking-tight">Domio</span>
          <span className="ml-1 rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
            admin
          </span>
        </Link>
        <nav className="hidden gap-1 md:flex">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
          <span>marketplace api</span>
        </div>
      </div>
    </header>
  );
}
