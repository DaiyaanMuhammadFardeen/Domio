/**
 * @domio/obs-control-plane — emit generated observability artifacts.
 *
 * Generates:
 *   - infra/prometheus/alerts/slo.yaml
 *   - infra/alertmanager/routes.yaml
 *   - infra/status-page/components.yaml
 *   - infra/grafana/dashboards/<service>.json  (one per service in catalogue)
 *
 * Source of truth: docs/slos/catalogue.md.
 *
 * Run from repo root: `pnpm --filter @domio/obs-control-plane generate`
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseSloCatalogue,
  generateAllAlerts,
  renderPrometheusRules,
  generateRoutes,
  renderAlertmanagerYaml,
  verifyRoutesCoverAlerts,
  generateStatusPageComponents,
  renderStatusPageYaml,
  verifyStatusPageCoversSlos,
  generateDashboard,
  generateProbes,
  renderProbesYaml,
  verifyProbesCoverTier1,
} from './index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..', '..');

const CATALOGUE = join(REPO_ROOT, 'docs/slos/catalogue.md');
const OUT = {
  promAlerts: join(REPO_ROOT, 'infra/prometheus/alerts/slo.yaml'),
  routes: join(REPO_ROOT, 'infra/alertmanager/routes.yaml'),
  components: join(REPO_ROOT, 'infra/status-page/components.yaml'),
  dashboards: join(REPO_ROOT, 'infra/grafana/dashboards'),
  probes: join(REPO_ROOT, 'infra/synthetics/probes.yaml'),
};

function ensureDir(p: string): void {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

function emit(path: string, content: string): void {
  ensureDir(dirname(path));
  writeFileSync(path, content, 'utf8');
  console.log(`wrote ${path} (${content.length} bytes)`);
}

function main(): void {
  const md = readFileSync(CATALOGUE, 'utf8');
  const slos = parseSloCatalogue(md);
  console.log(`parsed ${slos.length} SLO entries from ${CATALOGUE}`);

  // Prometheus alerts.
  const alerts = generateAllAlerts(slos);
  emit(OUT.promAlerts, renderPrometheusRules(alerts));

  // Alertmanager routes.
  const routes = generateRoutes(slos);
  emit(OUT.routes, renderAlertmanagerYaml(routes));

  const routeCheck = verifyRoutesCoverAlerts(alerts, routes);
  if (routeCheck.missing.length > 0) {
    for (const m of routeCheck.missing) {
      console.warn(`WARN: no Alertmanager route matches alert ${m.alertName}`);
    }
  }

  // Status page components.
  const components = generateStatusPageComponents(slos);
  emit(OUT.components, renderStatusPageYaml(components));

  const componentCheck = verifyStatusPageCoversSlos(components, slos);
  if (componentCheck.missing.length > 0) {
    for (const m of componentCheck.missing) {
      console.warn(`WARN: no status-page component for ${m.service} (SLO ${m.slo})`);
    }
  }

  // Grafana dashboards — one per service.
  ensureDir(OUT.dashboards);
  const byService = new Map<string, typeof slos>();
  for (const slo of slos) {
    const arr = byService.get(slo.service) ?? [];
    arr.push(slo);
    byService.set(slo.service, arr);
  }
  for (const [service, serviceSlos] of byService.entries()) {
    const dash = generateDashboard({
      service,
      displayName: service.replace(/^@domio\//, ''),
      tier: serviceSlos[0]!.tier,
      slos: serviceSlos,
    });
    const file = join(OUT.dashboards, `${dash.uid.replace(/^domio-/, '')}.json`);
    writeFileSync(file, JSON.stringify(dash, null, 2) + '\n', 'utf8');
    console.log(`wrote ${file}`);
  }

  // Synthetics probes — tier-1 only, multi-region.
  const probes = generateProbes(slos);
  emit(OUT.probes, renderProbesYaml(probes));

  const probeCheck = verifyProbesCoverTier1(probes, slos);
  if (probeCheck.missing.length > 0) {
    for (const m of probeCheck.missing) {
      console.warn(`WARN: no synthetics probe for tier-1 SLO ${m.service}::${m.slo}`);
    }
  }
  if (probeCheck.extra.length > 0) {
    for (const x of probeCheck.extra) {
      console.warn(`WARN: probe ${x.id} does not match any tier-1 SLO`);
    }
  }

  console.log('done.');
}

main();
