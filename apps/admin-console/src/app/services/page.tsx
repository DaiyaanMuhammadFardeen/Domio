/**
 * /services — service directory for the admin console.
 *
 * Per Wave 13. The hardcoded list has been replaced by an import
 * from `apps/landing/src/lib/services-registry.ts` — the single
 * source of truth for the user-facing service taxonomy. Adding a
 * new user-facing service means adding one entry to
 * `services-registry.ts`; the admin-console table picks it up
 * automatically.
 *
 * Pure backend services and infrastructure (postgres, redis, …) are
 * excluded by design — see `services-registry.ts` for the taxonomy.
 */

import type { ReactElement } from 'react';
import { USER_FACING_SERVICES } from '../../../../landing/src/lib/services-registry';

export default function ServicesPage(): ReactElement {
  const sorted = [...USER_FACING_SERVICES].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight text-slate-900">
        Service directory
      </h1>
      <p className="mb-6 text-sm text-slate-500">
        Every user-facing service Domio ships: name, dev port, owning team, and last production
        deploy. The list comes from <code>services-registry.ts</code> — adding a service means
        adding one entry there. Pure backend services and infrastructure (Postgres, Redis, NATS) are
        intentionally excluded.
      </p>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-2 text-left">Service</th>
              <th className="px-4 py-2 text-left">Port</th>
              <th className="px-4 py-2 text-left">Owners</th>
              <th className="px-4 py-2 text-right">Consumers</th>
              <th className="px-4 py-2 text-left">Description</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map((svc) => (
              <tr key={svc.id} data-testid="service-row">
                <td className="px-4 py-2 font-mono text-xs text-slate-900">
                  <a
                    className="text-blue-600 hover:underline"
                    href={`/services/${svc.id}`}
                    data-testid={`service-row-link-${svc.id}`}
                  >
                    {svc.name}
                  </a>
                </td>
                <td className="px-4 py-2 tabular-nums text-slate-700">{svc.port}</td>
                <td className="px-4 py-2 text-slate-700">{svc.owners.join(', ')}</td>
                <td className="px-4 py-2 text-right tabular-nums text-slate-700">
                  {svc.consumers.length}
                </td>
                <td className="px-4 py-2 text-slate-600">{svc.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
