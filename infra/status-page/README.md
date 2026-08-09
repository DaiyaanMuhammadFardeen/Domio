# infra/status-page — public status page

Public status page for `status.domio.app`. This module owns three things:

1. **Component source-of-truth.** `components.yaml` is generated from
   `docs/slos/catalogue.md` by
   `pnpm --filter @domio/obs-control-plane generate`. One component per
   service. Each component lists the SLO names that gate its
   "operational" state.

2. **Hosting.** `main.tf` provisions S3 + CloudFront + Route53 +
   ACM. The bucket is private; CloudFront serves a static SPA from
   `infra/status-page/static/` (TBD — out of scope for P22-beta, the
   stub renders the components YAML verbatim).

3. **Probe → page bridge.** A multi-region probe (see
   `infra/synthetics/`) hits each component's `health_check_url` every
   60 s. Probe results flow through Alertmanager → webhook → a small
   update Lambda → S3 → CDN cache invalidation.

## How a component changes from green → degraded

```
synthetics probe
   │
   ▼
[ probe post ] → Alertmanager → webhook (URL from status_page.tf)
   │
   ▼
[ status-page-update Lambda ] → puts object → invalidates /index.html
   │
   ▼
[ CDN cache miss ] → fresh index.html with new state
```

## Regenerating components

```sh
pnpm --filter @domio/obs-control-plane generate
```

This rewrites `infra/status-page/components.yaml` and also regenerates
`infra/prometheus/alerts/slo.yaml`, `infra/alertmanager/routes.yaml`,
and one Grafana dashboard JSON per service under
`infra/grafana/dashboards/`.

## Local dev

There is no local server. The components YAML is static; to preview it,
open `infra/status-page/components.yaml` in any YAML viewer.

## Why this is not a SaaS status page

The contract we're optimizing for is **drift between what we promise and
what we emit**. Because `components.yaml` is generated from the same
catalogue that emits our SLO alerts, dashboards, and PagerDuty routes,
the status page cannot lie about what we monitor.

A SaaS status page (Better Stack, Atlassian Statuspage) decouples those
two — the on-call engineer updates the SaaS manually. That coupling is
where incidents go to die.

## Out of scope (P22-beta)

- Static SPA rendering. We only emit the YAML.
- The "update component" Lambda. For P22-beta, status updates are
  manual: on-call edits `infra/status-page/components.yaml` in a
  hot-fix PR.
- Incident timeline. Deferred to P23+; today the
  `p22b.audit-log.md` (in this PR) is the timeline.

## See also

- [`docs/slos/catalogue.md`](../../docs/slos/catalogue.md) — source of truth
- [`docs/slos/error-budget-policy.md`](../../docs/slos/error-budget-policy.md)
- [`infra/alertmanager/routes.yaml`](../alertmanager/routes.yaml)
- [`infra/synthetics/`](../synthetics/)