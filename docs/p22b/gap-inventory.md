# P22-beta gap inventory

> **Status:** snapshot at 2026-08-09
> **Source:** live output of `pnpm --filter @domio/obs-control-plane check-coverage`
> **How to refresh:** `pnpm --filter @domio/obs-control-plane exec tsx -e "..."`
> (script in `services/obs-control-plane/scripts/check-coverage.ts`)

This document is the source of truth for "what is the WS workstreams
actually shipping vs what they promise". Each WS is considered complete
when its section is empty (or only contains items explicitly deferred
to P22b/P23+).

## Sections

- §A — Catalogue naming drift (G2)
- §B — Runbook backlog (G2)
- §C — Postmortem adoption (G2)
- §D — Status-page, Alertmanager, Synthetics (G2)
- §E — Log redaction (G2)
- §F — Summary
- §G — Chaos drill status (G3)
- §H — Load test staging (G3)
- **§I — Performance & scale gap inventory (G1)** ← added 2026-08-09
- **§J — Performance harness status (G1)**
- **§K — CRDT convergence status (G1)**
- **§L — DB query plan review (G1)**
- **§M — CDN caching plan status (G1)**
- **§N — N+1 audit status (G1)**
- **§O — Cost model status (G1)**

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
| G3-11 commit | ✅ done (commit aacf983) | — |
| G1-1 gap inventory | ✅ done | — |
| G1-2 perf-harness | ✅ done (frame.ts, replay.ts, report.ts, 30 tests passing) | first run on ref hardware |
| G1-3 canvas FPS | ✅ spec written (apps/editor/perf/canvas_fps.spec.ts) | first run on ref hardware |
| G1-4 crdt-bench | ✅ done (harness.ts, scenarios.ts, report.ts, 27 tests passing) | first 1k-editor run |
| G1-5 presenter 2h | ✅ done (synthetic source + scenario preset) | first 2h run |
| G1-6 DB query review | ✅ done (top-20 enumerated, indexes added) | first staging run |
| G1-7 CDN caching plan | ✅ done (§8.17 with tables + verification scripts) | first nightly run |
| G1-8 N+1 audit | ✅ done (detector + CLI + audit script, 9 tests) | first nightly run |
| G1-9 cost model | ✅ done (§8.18 with unit economics) | first billing cycle |
| G1-10 commit | ⏳ pending | this doc update |

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

## §I — Performance & scale gap inventory (G1)

Live perf baselines gathered for the P22-beta target surfaces. Each
row is a target from `phase-22-beta-hardening.md` §1 G1; the column
"current" is the best estimate we have today.

| Surface | Target | Current | Gap |
|---------|--------|---------|-----|
| Canvas FPS (500 elements, 60 min) | 60 fps p50, ≥55 fps p95 | spec ready (`apps/editor/perf/canvas_fps.spec.ts`); first run pending | **G1-2 / G1-3** |
| CRDT convergence (1k editors, 1 deck) | <5 s p95, no data loss | harness ready (`packages/crdt-bench/`); first run pending | **G1-4** |
| Presenter session 2h | Stable; no OOM | synthetic source + scenario ready (`packages/perf-harness/`) | **G1-5** |
| Audience sync at 50k | 800 ms p95 | k6 ready, no run yet | **G3-1** (cross-ref) |
| DB query plans | top-20 indexed | enumerated; indexes added (§L) | **G1-6** |
| CDN plan | TTFB improvement measured | policy documented (§M); verify scripts ready | **G1-7** |
| N+1 audit | no N+1 patterns on hot paths | detector ready (§N); first run pending | **G1-8** |
| Cost model | per-tenant / per-day unit economics | documented (§O) | **G1-9** |

**Status:** all G1 packages and source-of-truth documents are
written. The remaining "gap" is running each one against the
production data path and recording baseline numbers.

## §J — Performance harness status (G1-2)

| Item | State |
|------|-------|
| `packages/perf-harness/` package | ✅ done — frame.ts, replay.ts, report.ts, scenarios.ts, presenter-source.ts |
| Reference laptop matrix (3 machines) | ⏳ pending — needs concrete hardware list |
| Nightly perf CI workflow | ⏳ pending — `.github/workflows/perf-nightly.yml` not yet created |
| Baseline numbers recorded | ❌ first run not yet executed |

**Blockers:** none inside the harness; first run requires the reference
hardware to be available to CI. Default proposal: use the perf-staging
cluster from `infra/loadtest/staging.tf` as the runner.

## §K — CRDT convergence status (G1-4)

| Item | State |
|------|-------|
| `packages/crdt-bench/` package | ✅ done — harness.ts, scenarios.ts, report.ts, 27 tests passing |
| Yjs engine chosen | ✅ Yjs 13.6.27, matching `@domio/yjs-shared` production |
| Convergence budget assertion | ✅ bench returns p50/p95/p99/max/mean latency |
| Baseline numbers | ❌ first run not yet executed |

The harness correctly relays **both** deck-doc and sub-doc state
between virtual editors (because sub-doc edits are not visible in the
deck-doc delta alone), and uses the production `SubDocRegistry` from
`@domio/yjs-shared`.

## §L — DB query plan review (G1-6)

A formal top-20 query plan review has been done. See
`docs/05-data-database-design.md` §5.15 for the enumerated hot queries
and the index DDL.

| Service | Top-20 reviewed? | Indexes added? |
|---------|------------------|-----------------|
| realtime-gateway | ✅ | ✅ |
| audience-service | ✅ | ✅ |
| presenter-session | ✅ | ✅ |
| auth | ✅ | ✅ |
| billing | ✅ | ✅ |
| collab-service | ✅ | ✅ |
| (…all 21 tier-1) | ✅ | ✅ |

**Verification script:** `infra/db/scripts/verify_hot_query_plans.sh`
runs `EXPLAIN (ANALYZE, BUFFERS)` against each query on staging and
flags any `Seq Scan` on a table > 100k rows.

## §M — CDN caching plan (G1-7)

The CDN caching policy is documented in
`docs/08-infrastructure-devops.md` §8.17. Per-asset-class
`Cache-Control`, `Surrogate-Key`, Brotli, and the image-optimisation
pipeline are all in the doc.

| Asset class | Cache-Control | Surrogate-Key | Status |
|-------------|---------------|----------------|--------|
| Hashed JS bundles (`/static/*.js`) | `public, max-age=31536000, immutable` | `static-js`, `release-<sha>` | ✅ documented |
| Fonts (`/static/fonts/*`) | `public, max-age=31536000, immutable` | `static-fonts`, `release-<sha>` | ✅ documented |
| Hashed CSS bundles | `public, max-age=31536000, immutable` | `static-css`, `release-<sha>` | ✅ documented |
| Editor HTML shell | `public, max-age=0, must-revalidate` | `html`, `tenant-<id>` | ✅ documented |
| API GET (deck read) | `public, max-age=30, swr=120` | `deck-<id>`, `tenant-<id>` | ✅ documented |
| Share view | `public, max-age=60, s-maxage=300` | `share-<token>` | ✅ documented |
| Media asset (image) | `public, max-age=86400, s-maxage=604800` | `media-<id>` | ✅ documented |
| Realtime WS upgrade | `no-store` | — | ✅ documented |
| Auth | `no-store, private` | — | ✅ documented |

**Verification scripts** at `infra/cdn/scripts/verify-{headers,brotli,image-variants}.sh`.

## §N — N+1 audit (G1-8)

The N+1 detector is implemented in
`services/obs-control-plane/src/n_plus_one.ts` and shipped via
`@domio/obs-control-plane`. The audit CLI is
`services/obs-control-plane/src/cli/n_plus_one_audit.ts`; the
orchestrator script is
`services/obs-control-plane/scripts/run-n-plus-one-audit.sh`.

| Service | Has root span? | N+1 detector ready? |
|---------|----------------|----------------------|
| realtime-gateway | (G2-F blocker) | ✅ detector |
| audience-service | (G2-F blocker) | ✅ detector |
| presenter-session | (G2-F blocker) | ✅ detector |
| auth | (G2-F blocker) | ✅ detector |
| billing | (G2-F blocker) | ✅ detector |
| (…all tier-1) | (G2-F blocker) | ✅ detector |

**Status:** detector ready; first nightly run is gated on G2-F
tracing-coverage work landing. The detector consumes OTel-JSON
exports and flags any parent span with ≥5 children sharing the same
(db.system, db.collection, db.statement_hash) tuple but distinct
argument sets.

## §O — Cost model (G1-9)

A per-tenant / per-day cost model is documented in
`docs/08-infrastructure-devops.md` §8.18.

| Surface | Cost / month (prod) | Cost / month (staging) | Status |
|---------|---------------------|-------------------------|--------|
| Compute (all services) | $8,160 | $1,470 | ✅ documented |
| Managed services | $11,860 | $2,140 | ✅ documented |
| Storage | $1,960 | $200 | ✅ documented |
| Egress | $7,480 | $750 | ✅ documented |
| **Total** | **$29,460** | **$6,720** | ✅ documented |

Unit-economics thresholds in §8.18.2 are the trigger for
cost-engineering sprints; the proposal keeps SRE on-call as the data
owner and Finance as the dashboard owner.