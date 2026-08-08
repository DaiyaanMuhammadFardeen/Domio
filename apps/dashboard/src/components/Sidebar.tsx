'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';

interface NavItem {
  href: string;
  label: string;
  group: 'Analytics' | 'Experiments' | 'Operations' | 'Power';
}

const NAV: ReadonlyArray<NavItem> = [
  { href: '/overview', label: 'Overview', group: 'Analytics' },
  { href: '/deck', label: 'Decks', group: 'Analytics' },
  { href: '/heatmap', label: 'Heatmap', group: 'Analytics' },
  { href: '/team', label: 'Team', group: 'Analytics' },
  { href: '/ab', label: 'A/B tests', group: 'Experiments' },
  { href: '/crm', label: 'CRM sync', group: 'Operations' },
  { href: '/live', label: 'Live HUD', group: 'Operations' },
  { href: '/benchmarks', label: 'Benchmarks', group: 'Power' },
  { href: '/export', label: 'Export', group: 'Power' },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/overview') return pathname === '/overview';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar() {
  const pathname = usePathname() ?? '/';
  const grouped = NAV.reduce<Record<string, NavItem[]>>((acc, item) => {
    const list = acc[item.group] ?? [];
    list.push(item);
    acc[item.group] = list;
    return acc;
  }, {});

  return (
    <aside className="hidden w-56 shrink-0 border-r border-slate-200 bg-white md:block">
      <div className="sticky top-[57px] px-3 py-4">
        {(Object.keys(grouped) as Array<keyof typeof grouped>).map((group) => (
          <div key={group} className="mb-5">
            <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {group}
            </div>
            <ul className="space-y-0.5">
              {(grouped[group] ?? []).map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={clsx(
                        'block rounded-md px-2 py-1.5 text-sm font-medium transition',
                        active
                          ? 'bg-brand-50 text-brand-700'
                          : 'text-slate-700 hover:bg-slate-100',
                      )}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </aside>
  );
}