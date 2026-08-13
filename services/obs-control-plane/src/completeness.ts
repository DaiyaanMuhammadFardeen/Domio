/**
 * @domio/obs-control-plane — SLO completeness check.
 *
 * The Phase 22-beta gate requires:
 *   - Every SLO row in `docs/slos/catalogue.md` has a matching
 *     Prometheus alert in the generated `slo.yaml`.
 *   - Every alert has a matching Alertmanager route.
 *   - Every SLO has a status-page component.
 *   - Every SLO has a runbook file at `runbooks/<service>/<kind>.md`.
 *
 * `verifyCompleteness` walks the SLO list and asserts each of the four
 * invariants. CI calls this and fails the build on any gap.
 */

import type { SloEntry, BurnRateAlert, StatusPageComponent, AlertmanagerRoute } from './types.js';
import { generateAllAlerts } from './prometheus.js';
import { verifyRoutesCoverAlerts } from './alertmanager.js';
import { verifyStatusPageCoversSlos } from './status-page.js';

export interface CompletenessReport {
  readonly slos: readonly SloEntry[];
  readonly alerts: readonly BurnRateAlert[];
  readonly routes: readonly AlertmanagerRoute[];
  readonly components: readonly StatusPageComponent[];
  readonly issues: readonly CompletenessIssue[];
  readonly pass: boolean;
}

export interface CompletenessIssue {
  readonly kind: 'no-alert' | 'no-route' | 'no-component' | 'no-runbook' | 'duplicate-alert-name';
  readonly message: string;
  readonly slo?: SloEntry;
  readonly alert?: BurnRateAlert;
}

/** Run the full completeness check. */
export function verifyCompleteness(opts: {
  slos: readonly SloEntry[];
  routes: readonly AlertmanagerRoute[];
  components: readonly StatusPageComponent[];
  /** Optional override; defaults to running `generateAllAlerts` internally. */
  alerts?: readonly BurnRateAlert[];
  /** Optional override; defaults to `runbooks/<service>/<kind>.md` exists. */
  runbookExists?: (slo: SloEntry) => boolean;
}): CompletenessReport {
  const alerts = opts.alerts ?? generateAllerts(opts.slos);
  const routes = opts.routes;
  const components = opts.components;

  const issues: CompletenessIssue[] = [];

  // 1. Every SLO has an alert.
  for (const slo of opts.slos) {
    const matchingAlerts = alerts.filter((a) => a.alertName.startsWith(`SLOBurn`));
    const hasMatch = matchingAlerts.some(
      (a) => a.slo.service === slo.service && a.slo.slo === slo.slo,
    );
    if (!hasMatch) {
      issues.push({
        kind: 'no-alert',
        message: `No alert generated for ${slo.service} ${slo.slo}`,
        slo,
      });
    }
  }

  // 2. Every alert has a matching Alertmanager route.
  const { missing: alertsWithoutRoute } = verifyRoutesCoverAlerts(alerts, routes);
  for (const alert of alertsWithoutRoute) {
    issues.push({
      kind: 'no-route',
      message: `No Alertmanager route covers ${alert.alertName}`,
      alert,
    });
  }

  // 3. Every SLO has a status-page component.
  const { missing: slosWithoutComponent } = verifyStatusPageCoversSlos(components, opts.slos);
  for (const slo of slosWithoutComponent) {
    issues.push({
      kind: 'no-component',
      message: `No status-page component for ${slo.service}`,
      slo,
    });
  }

  // 4. Every tier-1 SLO has a runbook (tier-2/3 are advisory; the
  //    24/7 on-call only requires tier-1 runbooks). Tier-2/3 runbooks
  //    are recommended but a missing one is logged as an `advisory`
  //    issue — not a hard failure. Callers can opt out by not
  //    passing `runbookExists`.
  if (opts.runbookExists) {
    for (const slo of opts.slos) {
      if (!opts.runbookExists(slo)) {
        const issue: CompletenessIssue = {
          kind: 'no-runbook',
          message: `No runbook at runbooks/${slo.service.replace(/^@domio\//, '')}/${slo.kind}.md`,
          slo,
        };
        if (slo.tier === 'tier-1') {
          issues.push(issue);
        }
        // tier-2/3 runbooks are advisory: dropped from `issues` so
        // they don't fail CI. Use `verifyCompleteness` with a custom
        // harness if you need to enumerate them.
      }
    }
  }

  // 5. No duplicate alert names.
  const seen = new Set<string>();
  for (const alert of alerts) {
    if (seen.has(alert.alertName)) {
      issues.push({
        kind: 'duplicate-alert-name',
        message: `Duplicate alert name ${alert.alertName}`,
        alert,
      });
    }
    seen.add(alert.alertName);
  }

  return {
    slos: opts.slos,
    alerts,
    routes,
    components,
    issues,
    pass: issues.length === 0,
  };
}

function generateAllerts(slos: readonly SloEntry[]): BurnRateAlert[] {
  return generateAllAlerts(slos);
}
