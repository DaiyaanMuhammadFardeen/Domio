import Link from 'next/link';
import { dashboard, type DashboardRoute } from '@domio/ui/routing';

const NAV_ITEMS: ReadonlyArray<{ route: DashboardRoute; label: string }> = [
  { route: 'overview', label: 'Overview' },
  { route: 'deck', label: 'Decks' },
  { route: 'heatmap', label: 'Heatmap' },
  { route: 'ab', label: 'A/B' },
  { route: 'crm', label: 'CRM' },
  { route: 'team', label: 'Team' },
  { route: 'live', label: 'Live' },
  { route: 'benchmarks', label: 'Benchmarks' },
];

export function Header() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-6 px-6 py-3">
        <Link href={dashboard('overview')} className="flex items-center gap-2">
          <span className="inline-block h-7 w-7 rounded-md bg-brand-600" aria-hidden />
          <span className="text-lg font-semibold tracking-tight">Domio</span>
          <span className="ml-1 rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
            dashboard
          </span>
        </Link>
        <nav className="hidden gap-1 md:flex">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.route}
              href={dashboard(item.route)}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
          <span>warehouse ok</span>
        </div>
      </div>
    </header>
  );
}
