/**
 * @domio/dashboard — observability bootstrap (Phase 17 final).
 *
 * Mirrors `apps/api/src/observability.ts`. Initializes the OTLP bundle
 * once per process (which in Next.js terms means once per worker
 * instance — the dashboard runs in Node.js runtime for the GraphQL
 * gateway and edge runtime for some routes; we coerce everything to
 * node by gating on `typeof window`).
 */

import {
  init as initObservability,
  type DomioObservability,
} from '@domio/observability';

let cached: DomioObservability | null = null;

function getBundle(): DomioObservability {
  if (cached) return cached;
  cached = initObservability({
    serviceName: 'domio-dashboard',
    serviceVersion: process.env['SERVICE_VERSION'] ?? '0.0.0',
    environment: process.env['NODE_ENV'] ?? 'development',
    gitSha: process.env['GIT_SHA'] ?? 'dev',
  });
  return cached;
}

export function getLogger(): DomioObservability['logger'] {
  return getBundle().logger;
}

export function getTracer(): DomioObservability['tracer'] {
  return getBundle().tracer;
}

export function getMeter(): DomioObservability['meter'] {
  return getBundle().meter;
}

export async function shutdown(): Promise<void> {
  if (cached) {
    await cached.shutdown();
    cached = null;
  }
}