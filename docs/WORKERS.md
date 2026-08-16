# Domio — Workers (batch / queue)

> **Source of truth:** `workers/` (23 entries). **Last regenerated:** 2026-08-16.

Workers are short-lived / batch jobs — cron, queue consumers, async
render/transcode, AI eval. They run inside the same monorepo but are
deployed independently from the long-running services.

## Catalog

| Worker                       | Purpose                                                       |
| ---------------------------- | ------------------------------------------------------------- |
| `brand-extract`              | URL → brand kit (colors, fonts, logo)                         |
| `theme-pair`                 | Light/dark theme pair generator                               |
| `ai-eval`                    | AI prompt / completion eval harness                           |
| `sync`                       | Cross-tenant sync                                            |
| `accessibility-audit`        | axe + manual audit pipeline                                   |
| `refresh-scheduler`          | Periodic data refresh                                         |
| `freshness-tracker`          | Data freshness monitor                                        |
| `export-render`              | Long-running export queue consumer                            |
| `ingest-docs`                | Document ingestion for doc-to-deck                            |
| `data-analysis`              | Data prep for live data binding                               |
| `session-archiver`           | Long-term cold storage                                        |
| `handout-generator`          | Notes / 4-up handout generation                               |
| `scorm-packager`             | SCORM packaging for LMS                                       |
| `moderation-flagger`         | Async moderator flagging                                      |
| `expiry-scanner`             | Content-expiry scanning                                       |
| `library-propagator`         | Shared-slide update propagation                               |
| `diff-engine`                | Document diff orchestrator                                    |
| `subscription-billing`       | Recurring billing                                             |
| `refund-processor`           | Refund flow                                                   |
| `payout-executor`            | Creator payouts                                               |
| `fx-rate-cacher`             | FX rate cache                                                 |
| `kyc-poller`                 | KYC status polling                                            |
| `kyc-rescreen`               | Periodic KYC re-screening                                     |

## Where they live

- Source — `workers/<name>/`
- Tests — colocated `<name>.test.ts`
- Deployment — independent via the `domio` Helm umbrella + per-worker
  ArgoCD app under `infrastructure/argocd/applications/`