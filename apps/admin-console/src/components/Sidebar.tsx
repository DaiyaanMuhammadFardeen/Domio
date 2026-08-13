'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import { adminConsole } from '@domio/ui';

interface NavItem {
  href: string;
  label: string;
  group: 'Curation' | 'Moderation' | 'Finance' | 'Publishing' | 'Identity' | 'Billing' | 'Build' | 'Governance' | 'Integrations' | 'Lifecycle' | 'Operations';
}

const NAV: ReadonlyArray<NavItem> = [
  { href: '/', label: 'Overview', group: 'Curation' },
  { href: '/brand-locks', label: 'Brand Locks', group: 'Curation' },
  { href: '/trust', label: 'Trust Scoring', group: 'Curation' },
  { href: '/takedowns', label: 'Takedowns', group: 'Moderation' },
  { href: '/payouts', label: 'Payout Policy', group: 'Finance' },
  { href: '/custom-domains', label: 'Custom Domains', group: 'Publishing' },
  { href: adminConsole('sso'), label: 'SSO', group: 'Identity' },
  { href: adminConsole('scim'), label: 'SCIM', group: 'Identity' },
  { href: adminConsole('seats'), label: 'Seat Analytics', group: 'Billing' },
  { href: adminConsole('component-sdk'), label: 'Component SDK', group: 'Build' },
  { href: adminConsole('dlp'), label: 'DLP', group: 'Governance' },
  { href: adminConsole('residency'), label: 'Residency', group: 'Governance' },
  { href: adminConsole('api-keys'), label: 'API Keys', group: 'Integrations' },
  { href: adminConsole('webhooks'), label: 'Webhooks', group: 'Integrations' },
  { href: adminConsole('sdk'), label: 'SDK', group: 'Integrations' },
  { href: adminConsole('legal-hold'), label: 'Legal Hold', group: 'Lifecycle' },
  { href: adminConsole('retention'), label: 'Retention', group: 'Lifecycle' },
  { href: adminConsole('rendering'), label: 'Headless Rendering', group: 'Operations' },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
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
