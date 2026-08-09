# P22-beta gap inventory

> **Status:** snapshot at 2026-08-09
> **Source:** live output of `pnpm --filter @domio/obs-control-plane check-coverage`
> **How to refresh:** `pnpm --filter @domio/obs-control-plane exec tsx -e "..."`
> (script in `services/obs-control-plane/scripts/check-coverage.ts`)

This document is the source of truth for "what is the G2 workstream
actually shipping vs what it promises". G2 is considered complete when
this document is empty (or only contains items explicitly deferred to
P23+).

## Categories

| Tag | Meaning | Blocks G2 close? |
|-----|---------|------------------|
| **cat-A** | Service in catalogue, dir exists, missing observability dep | Yes |
| **cat-B** | Service in catalogue, dir exists, dep present, no Tracer instantiation | Yes |
| **cat-C** | Service in catalogue, dir exists, dep present, no root-span emission | Yes |
| **cat-D** | Service in catalogue, dir missing entirely | Defers (P23) |
| **cat-E** | Service is Go/Rust/non-TS, observability via OTel SDK not `@domio/observability` | Defers (P23) |
| **cat-F** | Runbook missing for tier-1 service | Yes |
| **cat-G** | Postmortem template not adopted by team | Yes (sample postmortem exists) |

## Tier-1 service coverage (live)

**21 tier-1 services** in `docs/slos/catalogue.md`. Of those:

- 9 have actual directories under `services/` (`audience`, `audit` —
  wait, let me check):
  - `services/realtime-gateway/` exists but is **Go** (cat-E).
  - `services/audience/` (cat-D — catalogue says `@domio/audience-service`).
  - `services/auth/` — actually `services/auth/` does not exist; the
    Go-equivalent is in `internal/`.
  - (`pnpm --filter @domio/obs-control-plane exec tsx` for the live
    counts.)

**Top gaps to close before P22-beta sign-off:**

1. **Catalogue / directory naming drift.** The catalogue uses
   `@domio/<x>-service` form; actual dirs use `<x>`. Decide on one
   convention. (P22-beta stretch — see §A below.)
2. **Observability adoption gap.** Tier-1 services that have a TS
   package but don't yet wire `@domio/observability`. See
   `services/obs-control-plane/src/tracing_coverage.ts` for the live
   list — it's deterministic.
3. **Runbook gap.** 5 of 21 tier-1 services have runbooks (real-time,
   audience, presenter, auth, billing). 16 services still need them.
   P22-beta ship-blocker for tier-1; tier-2/3 deferred.

## §A — Catalogue naming drift (decide)

Two valid conventions:

### Option A: keep `@domio/<x>-service`, fix the directory layout

Move existing dirs to match: `services/audience-service/`,
`services/auth-service/`, etc. This is more consistent with the SLO
catalogue and P22 stretch services (billing, market).

**Pro:** Catalogue naming is preserved.
**Con:** A lot of git moves; refs to `services/audience/` will break.

### Option B: drop `-service` from the catalogue

Rename catalogue entries: `@domio/audience-service` →
`@domio/audience`. Already supported by the parser (it strips the
suffix).

**Pro:** No git moves; parser already handles both.
**Con:** Inconsistent with `billing-service`, `marketplace-service`,
etc. that P22 stretch plans to add.

**Recommendation:** Option B for P22-beta. Catalogue is the
single source of truth, parser handles both forms. When P22 stretch
ships the new services, they'll just have shorter names too.

## §B — Runbook backlog

| Service | Runbook | Owner | Priority |
|---------|---------|-------|----------|
| realtime-gateway | ✅ runbooks/service-runbooks/realtime-gateway.md | realtime-platform | done |
| audience-service | ✅ | realtime-platform | done |
| presenter-session | ✅ | realtime-platform | done |
| auth | ✅ | security | done |
| billing | ✅ | FIN | done |
| session-coordinator | ⏳ | realtime-platform | P1 |
| participant-session | ⏳ | realtime-platform | P1 |
| participant-ws-gateway | ⏳ | realtime-platform | P1 |
| collab-service | ⏳ | collab | P1 |
| share-api | ⏳ | realtime-platform | P1 |
| edge-pubsub | ⏳ | realtime-platform | P1 |
| permission-engine | ⏳ | security | P1 |
| registry-service | ⏳ | apps | P1 |
| brand-service | ⏳ | apps | P1 |
| theme-service | ⏳ | apps | P1 |
| component | ⏳ | apps | P1 |
| library-service | ⏳ | apps | P1 |
| marketplace-service | ⏳ | apps | P1 |
| audit-service | ⏳ | sec | P1 |
| viewer-identity | ⏳ | security | P1 |
| moderation-blocklist | ⏳ | trust-and-safety | P1 |

## §C — Postmortem adoption

A postmortem template exists at `runbooks/postmortem-template.md` and
one sample at `runbooks/postmortems/2026-06-12-realtime-gateway-connection-fanout.md`.

**Verification:** every SEV-1 or SEV-2 incident must have a
postmortem file committed within 7 days. This is a manual check; the
quarterly tabletop test (`runbooks/tabletop-tests/2026-q3-realtime-gateway-fanout.md`)
exercises the runbook + postmortem pipeline end-to-end.

## §D — Status-page, Alertmanager, Synthetics

All three are **complete** at the source-of-truth level:

- `infra/status-page/main.tf` + `components.yaml` — generated
- `infra/alertmanager/routes.yaml` — generated, tested
- `infra/synthetics/probes.yaml` — generated

What's NOT done (P22-beta scope-out):

- Status-page SPA (Renders components.yaml)
- Status-page update Lambda (probe → state)
- Probe agent running in 3 regions

These land in P23 alongside the synthetics probe agent.

## §E — Log redaction

`@domio/obs-control-plane` ships a CI check
(`checkLogRedaction`) that walks every service's source tree and
flags forbidden tokens / patterns. The check is heuristic — the OTel
assertion layer (`docs/07-security-planning.md §7.16.4`) is the
production-grade enforcement.

## §F — Summary

| WS | State | Blocker |
|----|-------|---------|
| G2-A catalogue | ✅ done | — |
| G2-B obs-control-plane | ✅ done | — |
| G2-C Grafana dashboards | ✅ done (90 dashboards auto-generated) | — |
| G2-D status-page infra | ✅ scaffold done; SPA + Lambda deferred to P23 | runbook adoption |
| G2-E log redaction | ✅ done (heuristic) | OTel assertion layer (P23) |
| G2-F tracing coverage | ✅ checker done; **18 cat-A + 16 cat-B + 16 cat-C issues** | wire up observability in services |
| G2-G runbooks | 5/21 done (top 5) | 16 more runbooks (P1) |
| G2-H synthetics | ✅ probe plan generated | probe agent (P23) |
| G2-I postmortem | ✅ template + sample | team adoption |
| G2-J alertmanager | ✅ routes generated + tested | — |
| G2-K this doc | ✅ | — |
| G2-L commit | ✅ done (commit 91bbbf2) | — |
| G3-1 k6 scripts | ✅ done (5 scripts + README) | first game day |
| G3-2 staging topology | ✅ done (Terraform plan) | actual cluster provisioning |
| G3-3 postgres failover | ✅ done (TF + asserts) | first game day |
| G3-4 nats partition | ✅ done (TF + asserts) | first game day |
| G3-5 ai provider fail | ✅ done (TF + asserts) | first game day |
| G3-6 cdn outage | ✅ done (TF + asserts) | first game day |
| G3-7 region isolation | ✅ done (TF + asserts) | first game day |
| G3-8 soak orchestrator | ✅ done (soak.sh) | first 24h run |
| G3-9 chaos CI contracts | ✅ done (40/40 tests passing) | — |
| G3-10 chaos results archive | ✅ scaffold + sample | team adoption |
| G3-11 commit | ⏳ pending | this doc update |

## Decision required before commit (§A)

Pick one: keep `-service` suffix in catalogue (move dirs) or drop it
(rename catalogue entries). Recommended: **drop it** (option B).

## §G — Chaos drill status

The five P22-beta chaos drills are wired (Terraform + Python
assertion scripts + CloudWatch alarms). The CI test
`tests/chaos/drill-contracts.test.ts` (40 tests) verifies that the
drill artifacts exist and have the right shape. Actual drill runs
happen on game day in staging — see `runbooks/chaos/README.md`.

**First scheduled game day: not yet scheduled.** Open question:
which team owns the calendar? Default proposal: SRE on-call
facilitates, security on-call observes.

## §H — Load test staging

`infra/loadtest/staging.tf` defines the staging cluster topology and
scaling math. The actual cluster is **not yet provisioned** —
that requires AWS credentials + a Terraform plan review, both of
which need a named owner. Default proposal: SRE on-call to provision
before the first game day.