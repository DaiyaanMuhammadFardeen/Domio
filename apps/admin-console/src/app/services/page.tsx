/**
 * /services — service directory for the admin console.
 *
 * Per Wave 13 Phase D. Lists every user-facing service: name, dev
 * port, owners, and last-deploy timestamp. Phase B will replace the
 * hardcoded list with a typed import from
 * `apps/landing/src/lib/services-registry.ts`; for now the list is
 * inline so admins can confirm the directory surface before the
 * registry exists.
 *
 * Server-rendered (no client state). Rows are sorted by name so the
 * table stays stable across renders.
 */

import type { ReactElement } from 'react';

interface UserFacingService {
  readonly name: string;
  readonly port: number;
  readonly owners: ReadonlyArray<string>;
  /** ISO date string of the last production deploy. */
  readonly lastDeploy: string;
  readonly description: string;
}

const USER_FACING_SERVICES: ReadonlyArray<UserFacingService> = [
  {
    name: 'theme',
    port: 3000,
    owners: ['brand-team'],
    lastDeploy: '2026-08-09',
    description: 'Theme tokens, design primitives, brand-locked palettes.',
  },
  {
    name: 'brand',
    port: 3010,
    owners: ['brand-team', 'trust-team'],
    lastDeploy: '2026-08-08',
    description: 'Brand registry, palette enforcement, override policy.',
  },
  {
    name: 'ai-orchestrator',
    port: 7100,
    owners: ['ml-team'],
    lastDeploy: '2026-08-11',
    description: 'Routes model requests, applies guardrails, audits usage.',
  },
  {
    name: 'registry',
    port: 7110,
    owners: ['platform-team'],
    lastDeploy: '2026-08-10',
    description: 'Component / template / listing registry + version pinning.',
  },
  {
    name: 'marketplace-preview',
    port: 7200,
    owners: ['marketplace-team'],
    lastDeploy: '2026-08-09',
    description: 'Sandbox previews for marketplace listings (iframe surface).',
  },
  {
    name: 'control-plane',
    port: 7300,
    owners: ['platform-team'],
    lastDeploy: '2026-08-10',
    description: 'Workspace, billing, seats, audit fan-out for admin ops.',
  },
  {
    name: 'qa-engine',
    port: 7400,
    owners: ['qa-team'],
    lastDeploy: '2026-08-07',
    description: 'Automated component QA, regression suites, CI hooks.',
  },
  {
    name: 'quiz-engine',
    port: 7500,
    owners: ['education-team'],
    lastDeploy: '2026-08-06',
    description: 'Audience quiz grading, scoring, leaderboard sync.',
  },
  {
    name: 'reaction-broadcaster',
    port: 7600,
    owners: ['live-team'],
    lastDeploy: '2026-08-12',
    description: 'WS fan-out for reactions, raise-hand, emoji pings.',
  },
  {
    name: 'live-analytics',
    port: 7700,
    owners: ['analytics-team'],
    lastDeploy: '2026-08-11',
    description: 'Live HUD telemetry: viewers, attention, current slide.',
  },
];

function formatAge(lastDeploy: string): string {
  const ms = Date.now() - Date.parse(lastDeploy);
  if (!Number.isFinite(ms) || ms < 0) return lastDeploy;
  const days = Math.round(ms / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

export default function ServicesPage(): ReactElement {
  const sorted = [...USER_FACING_SERVICES].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight text-slate-900">
        Service directory
      </h1>
      <p className="mb-6 text-sm text-slate-500">
        Every user-facing service Domio ships: name, dev port, owning team, and last production deploy. The list is hardcoded for Phase D and will be replaced by the services registry in Phase B.
      </p>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-2 text-left">Service</th>
              <th className="px-4 py-2 text-left">Port</th>
              <th className="px-4 py-2 text-left">Owners</th>
              <th className="px-4 py-2 text-right">Last deploy</th>
              <th className="px-4 py-2 text-left">Description</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map((svc) => (
              <tr key={svc.name} data-testid="service-row">
                <td className="px-4 py-2 font-mono text-xs text-slate-900">{svc.name}</td>
                <td className="px-4 py-2 tabular-nums text-slate-700">{svc.port}</td>
                <td className="px-4 py-2 text-slate-700">{svc.owners.join(', ')}</td>
                <td className="px-4 py-2 text-right tabular-nums text-slate-700">
                  <span className="block">{svc.lastDeploy}</span>
                  <span className="text-xs text-slate-500">{formatAge(svc.lastDeploy)}</span>
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