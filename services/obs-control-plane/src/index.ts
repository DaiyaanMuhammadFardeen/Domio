/**
 * @domio/obs-control-plane — config-as-code for observability.
 *
 * Phase 22-beta G2 (Reliability & Observability). This package owns:
 *
 *   1. **Prometheus alert generation.** Reads `docs/slos/catalogue.md` and
 *      emits `infra/prometheus/alerts/slo.yaml` with burn-rate alerts at
 *      1h / 6h / 24h / 72h windows per the error budget policy.
 *
 *   2. **Alertmanager route generation.** Reads the same catalogue plus
 *      service tier metadata, emits `infra/alertmanager/routes.yaml` with
 *      tier-1 → 24/7 PagerDuty primary + secondary, tier-2/3 → business
 *      hours + ticket queue.
 *
 *   3. **Status page component generation.** Emits
 *      `infra/status-page/components.yaml` with one component per service.
 *
 *   4. **SLO completeness check.** Asserts that every row in the catalogue
 *      has a matching alert, route, runbook, dashboard, and status-page
 *      entry. Used by `services/obs-control-plane/tests/`.
 *
 * **Out of scope here:** actually scraping services, computing SLIs in
 * production, or rendering Grafana dashboards. Those live in
 * `infra/grafana/` (JSON dashboards) and `infra/prometheus/` (recording
 * rules). This package is the source-of-truth generator.
 */

export * from './types.js';
export * from './slo.js';
export * from './prometheus.js';
export * from './alertmanager.js';
export * from './status-page.js';
export * from './grafana.js';
export * from './completeness.js';
export * from './log_redaction.js';
export * from './tracing_coverage.js';
export * from './synthetics.js';
