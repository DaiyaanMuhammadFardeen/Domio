# infra/synthetics — multi-region probes

Black-box probes that hit each tier-1 component's `health_check_url` every
60 s from three geographic regions. Probe results drive the public status
page (see `infra/status-page/`) and Alertmanager webhook routing.

## What's here

- `probes.yaml` — auto-generated probe plan. One entry per tier-1 SLO.
  Source of truth: `docs/slos/catalogue.md`. Regenerate via
  `pnpm --filter @domio/obs-control-plane generate`.

## Probe plan format

```yaml
probes:
  - id: probe-realtime-gateway-avail-rt-gateway
    service: "@domio/realtime-gateway"
    slo: "avail-rt-gateway"
    tier: tier-1
    url: "https://realtime-gateway.domio.app/healthz"
    regions: ["us-east-1", "eu-west-1", "ap-southeast-1"]
    interval_seconds: 60
    timeout_seconds: 5
    expected_status: 200
```

## How probes become status updates

```
probe agent (each region, every 60s)
   │
   ▼
[ POST /probe-result ] → Alertmanager → webhook
   │
   ▼
[ status-page-update Lambda ] (defined in infra/status-page/main.tf)
   │
   ▼
[ writes new index.html to S3 ] → CloudFront cache invalidation
   │
   ▼
[ status.domio.app shows new state ]
```

## Why only tier-1

Tier-1 is user-facing-critical. Tier-2 and tier-3 are observed via
internal SLO burn-rate alerts and don't need an external probe. Adding
probes for tier-2/3 would be a 50% probe-cost increase for a marginal
observability win.

## Out of scope (P22-beta)

- Latency / synthetic-journey probes (e.g. "open editor, type, save").
  Today we only do the up/down `/healthz` check.
- Probe auth (token rotation, mTLS). Deferred to P23.
- Region failure isolation. If a region is down, its probe failures
  currently bubble up as component failures. We accept this for
  P22-beta and will add per-region quorum in P23.

## Local dev

There is no probe agent to run locally. To validate a probe URL:

```sh
curl -i https://realtime-gateway.domio.app/healthz
```

## See also

- [`docs/slos/catalogue.md`](../../docs/slos/catalogue.md) — source of truth
- [`infra/status-page/](../status-page/) — probe results land here
- [`infra/alertmanager/routes.yaml`](../alertmanager/routes.yaml)