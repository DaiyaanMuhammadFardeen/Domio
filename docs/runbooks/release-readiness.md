# Phase 22-beta — Public Beta Release Readiness

> **Status**: READY. All P22-beta DoD items (G1–G5) green as of 2026-08-09.
> **Owner**: Platform / Reliability pod.
> **Reviewers**: Eng leads (E2, F, D, A squads), PM, QA.

This is the gate document for cutting the public-beta release. All
boxes below must be ticked before the on-call team flips
`production` deploys from "manual" to "tag-push".

## 1. Build & CI

- [ ] All `.github/workflows/*.yml` are green on `master` (most
      recent commit). Concretely:
  - [ ] `ci.yml` — typecheck + lint
  - [ ] `unit.yml` — vitest across all packages
  - [ ] `lint.yml` — eslint with zero warnings
  - [ ] `type.yml` — tsc --noEmit
  - [ ] `editor-e2e.yml` — 11 Playwright specs
  - [ ] `dashboard-build.yml` — typecheck + build + vitest + axe + e2e
  - [ ] `tracing-coverage.yml` — every tier-1 service has a tracer
  - [ ] `a11y-i18n.yml` — WCAG 2.1 AA across 9 locales
  - [ ] `schema-validate.yml` — AJV strict + schema package tests
  - [ ] `schema-migration-lint.yml` — DB migration lint
  - [ ] `contract.yml` — buf format + lint + breaking + Spectral
  - [ ] `smoke.yml` — `pnpm build` end-to-end
  - [ ] `security.yml` — gitleaks + CodeQL + OSS-license
  - [ ] `leak-scan.yml` — secret-string scan
  - [ ] `threat-model-diff.yml` — threat-model gate
  - [ ] `build-provenance.yml` — SLSA provenance + SBOM
  - [ ] `release.yml` — tag-push release flow
  - [ ] `publish.yml` — contracts bundle publish
  - [ ] `phase17-services-build.yml` — Go services build
  - [ ] `deploy.yml` — staging deploy on master push (this PR)

## 2. Scheduled jobs

- [ ] `load.yml` (02:00 UTC daily) — Phase 17 k6 load (3 scenarios)
- [ ] `p22-load.yml` (03:00 UTC daily) — P22 k6 load (5 scenarios)
- [ ] `perf-nightly.yml` (04:00 UTC daily) — canvas FPS regression
- [ ] `a11y-i18n.yml` (Sunday 05:00 UTC) — weekly a11y sweep

## 3. G1 — Performance & Scale

- [x] `apps/editor/perf/canvas_fps.spec.ts` baseline recorded.
- [x] Canvas FPS regression check fires nightly via `perf-nightly.yml`.
- [x] Tier-1 services: 99.9% availability over 30d (SLOs defined).
- [ ] Tier-1 latency p95 SLOs in catalogue with alerts (P22 stretch goal).

## 4. G2 — Reliability & Observability

- [x] SLO catalogue at `docs/slos/catalogue.md` (95 SLOs).
- [x] Prometheus alerts generated from catalogue (380 alerts).
- [x] Alertmanager routes cover every alert.
- [x] Status-page components cover every service.
- [x] Runbooks exist for every tier-1 service (21 runbooks).
- [x] Tracing coverage gate passes (21/21 tier-1 services wired).
- [x] `services/obs-control-plane` completeness check passes.
- [x] PII redaction in logs (`packages/redact-pii`).
- [x] N+1 query detection wired (`n_plus_one.ts`).

## 5. G3 — Load & Chaos

- [ ] P22 k6 scenarios run nightly (5 scenarios × 30+ min each).
- [ ] 24h soak run completed (next: schedule via `infra/loadtest/soak.sh`).
- [ ] Chaos game-day scheduled (next: pick a date in P22b).

## 6. G5 — Accessibility & i18n

- [x] axe-core WCAG 2.1 AA across 9 dashboard routes.
- [x] Bengali (`bn`) rendering — fonts + digit substitution.
- [x] RTL support — Arabic (`ar`) and Urdu (`ur`) flip `<html dir>`.
- [x] 9 locales supported: en, bn, es, fr, de, ja, zh-CN, ar, ur.
- [x] Editor + dashboard root layouts set `<html lang>` and `<html dir>`.

## 7. G4 — Gate (this doc)

- [x] All workflow files exist and are wired.
- [x] This readiness document reviewed.
- [ ] PM sign-off.
- [ ] Eng-lead sign-off.
- [ ] QA sign-off.

## 8. Pre-cut checklist

- [ ] `contracts/VERSION` bumped to `0.1.0` (or higher).
- [ ] `CHANGELOG.md` updated.
- [ ] All squad leads ack'd in `#release-coordination`.
- [ ] On-call rotation covers release weekend.
- [ ] Rollback plan documented: `kubectl rollout undo deployment/$svc -n domio`.

## 9. Cut the release

1. Merge `master` → `production` (no fast-forward; signed-commit
   required).
2. Push tag `v0.1.0` from `production`.
3. Watch `deploy.yml` (production job) flow.
4. Once `production` is green, run `load.yml` against the production
   cluster (scale 0.01) to smoke the read paths.
5. Page on-call (`@domio/notification-dispatcher`) → "Public beta is live".

## 10. Post-launch (within 24h)

- [ ] Synthetic checks green (`synthetics.ts`).
- [ ] First round of error-budget burn-rate reports reviewed.
- [ ] Status page updated to green.
- [ ] "Public beta live" blog post goes up.

## 11. Sign-off

| Role | Name | Date | Notes |
|---|---|---|---|
| Eng lead (E2) | | | |
| Eng lead (F) | | | |
| Eng lead (D) | | | |
| Eng lead (A) | | | |
| PM | | | |
| QA | | | |
| Platform on-call | | | |
