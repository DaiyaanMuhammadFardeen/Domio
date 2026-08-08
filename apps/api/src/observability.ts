/**
 * apps/api — observability bootstrap.
 *
 * Phase 15 W16. Initializes the OTLP bundle once for the whole process
 * and exposes the presenter metrics facade. When
 * `OTEL_EXPORTER_OTLP_ENDPOINT` is unset the bundle runs in no-op mode
 * (flush is harmless) so dev/test flows keep working.
 */

import {
  init as initObservability,
  type DomioObservability,
} from '@domio/observability';
import {
  bindPresenterMetrics,
  type PresenterMetrics,
  nullPresenterMetrics,
} from '@domio/presenter-session';

let cachedBundle: DomioObservability | null = null;
let cachedMetrics: PresenterMetrics | null = null;

function getBundle(): DomioObservability {
  if (cachedBundle) return cachedBundle;
  cachedBundle = initObservability({
    serviceName: 'domio-api',
    serviceVersion: process.env['SERVICE_VERSION'] ?? '0.0.0',
    environment: process.env['NODE_ENV'] ?? 'development',
    gitSha: process.env['GIT_SHA'] ?? 'dev',
  });
  return cachedBundle;
}

/** Returns the presenter metrics facade, lazily wiring the OTLP meter. */
export function getPresenterMetrics(): PresenterMetrics {
  if (cachedMetrics) return cachedMetrics;
  const bundle = getBundle();
  cachedMetrics = bindPresenterMetrics({ meter: bundle.meter });
  return cachedMetrics;
}

/**
 * Convenience for tests that want to bypass the OTLP path entirely
 * without setting up a fake bundle.
 */
export function presenterMetricsForTests(): PresenterMetrics {
  return nullPresenterMetrics();
}

export async function shutdown(): Promise<void> {
  if (cachedBundle) {
    await cachedBundle.shutdown();
    cachedBundle = null;
  }
  cachedMetrics = null;
}