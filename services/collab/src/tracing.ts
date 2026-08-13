/**
 * @domio/collab — observability bootstrap.
 *
 * Initializes the OTLP tracer for this service via
 * `@domio/observability`. The `rootSpan()` helper is the
 * recommended entry point for any request-handling code path; it
 * starts a span and ensures it always closes via the `finally`
 * block. The tracer is no-op when `OTEL_EXPORTER_OTLP_ENDPOINT`
 * is unset / `disabled`, so test runs are free.
 *
 * Phase 22-beta G2: every tier-1 service must wire this up.
 */

import { init } from '@domio/observability';

const obs = init({
  serviceName: '@domio/collab',
  serviceVersion: '0.0.0',
  environment: process.env.NODE_ENV ?? 'development',
  gitSha: process.env.GIT_SHA ?? 'dev',
});

export const tracer = obs.tracer;

/**
 * Start a root span around an async operation. The span always
 * closes and reports an error if the operation throws.
 */
export async function rootSpan<T>(
  name: string,
  fn: (span: ReturnType<typeof tracer.startSpan>) => Promise<T>,
  attributes: Record<string, string | number | boolean> = {},
): Promise<T> {
  const span = tracer.startSpan(name, { attributes });
  try {
    return await fn(span);
  } catch (err) {
    span.recordException(err);
    span.setStatus('error', (err as Error).message);
    throw err;
  } finally {
    span.end();
  }
}
