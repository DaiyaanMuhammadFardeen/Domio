/**
 * services-docs — content generation for `/services/<name>` pages.
 *
 * Per Wave 13. The single-service stub page is auto-generated from the
 * service registry: name, port, description, consumer apps, docs link,
 * admin actions. Pure-infrastructure services (postgres, redis, etc.)
 * never produce a stub here.
 */

import type { UserFacingService } from './services-registry';
import { USER_FACING_SERVICES, userFacingById } from './services-registry';

export interface ServiceDoc {
  readonly service: UserFacingService;
  /** "/services/<id>" */
  readonly href: string;
  /** "/docs/<slug>" */
  readonly docsHref: string;
  readonly summary: string;
  readonly consumersLabel: string;
  readonly ownersLabel: string;
  readonly apiSurface: ReadonlyArray<string>;
  readonly runbookSteps: ReadonlyArray<string>;
}

/**
 * Surface the most common handlers the service exposes. Static for now
 * (registry-only); a future wave will introspect the actual handlers
 * from the service's source.
 */
const COMMON_HANDLERS: ReadonlyArray<string> = [
  'GET /healthz',
  'GET /v1/ready',
  'GET /v1/version',
];

const RUNBOOK_STEPS: ReadonlyArray<string> = [
  'Confirm the service is reachable at its dev port via curl /healthz.',
  'Inspect recent deploys on the admin-console /services page.',
  'Rotate keys if the breach window has expired (admin only).',
  'Check Grafana for error-rate spikes in the last 30 minutes.',
  'Page the on-call team via the link in /docs/runbooks.',
];

/**
 * Build the auto-generated stub doc for a single service.
 */
export function buildServiceDoc(id: string): ServiceDoc | null {
  const service = userFacingById(id);
  if (!service) return null;
  return {
    service,
    href: `/services/${encodeURIComponent(service.id)}`,
    docsHref: `/docs/${service.docsSlug}`,
    summary: shortSummary(service),
    consumersLabel: formatConsumers(service.consumers),
    ownersLabel: service.owners.join(', '),
    apiSurface: COMMON_HANDLERS,
    runbookSteps: RUNBOOK_STEPS,
  };
}

/**
 * List every stub that the directory page should generate links for.
 */
export function listServiceDocs(): ReadonlyArray<ServiceDoc> {
  return USER_FACING_SERVICES.map((service) => ({
    service,
    href: `/services/${encodeURIComponent(service.id)}`,
    docsHref: `/docs/${service.docsSlug}`,
    summary: shortSummary(service),
    consumersLabel: formatConsumers(service.consumers),
    ownersLabel: service.owners.join(', '),
    apiSurface: COMMON_HANDLERS,
    runbookSteps: RUNBOOK_STEPS,
  }));
}

function shortSummary(service: UserFacingService): string {
  const cap = service.description.charAt(0).toUpperCase() + service.description.slice(1);
  return `${cap} Owned by ${service.owners.join(', ')}.`;
}

function formatConsumers(consumers: ReadonlyArray<string>): string {
  if (consumers.length === 0) return 'No internal consumers';
  if (consumers.length === 1) return consumers[0]!;
  if (consumers.length === 2) return `${consumers[0]} and ${consumers[1]}`;
  return `${consumers.slice(0, -1).join(', ')}, and ${consumers[consumers.length - 1]}`;
}