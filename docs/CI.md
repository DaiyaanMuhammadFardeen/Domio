# Domio — CI

> **Source of truth:** `.github/workflows/` (30 files). **Last regenerated:** 2026-08-16.

## 1. Orchestrator

`.github/workflows/ci.yml` is the master orchestrator. It calls reusable
workflows for each category:

- **static** — contract, type, lint
- **unit + integration** — unit, integration
- **execution** — smoke, external-e2e, editor-e2e
- **a11y** — a11y-i18n, axe
- **ops** — chaos, p22-load, load, perf-nightly
- **security** — security, leak-scan, threat-model-diff, tracing-coverage, build-provenance
- **deploy / release** — deploy, release, publish, dashboard-build
- **schema** — schema-validate, schema-migration-lint
- **gate** — public-beta-gate, phase17-services-build

The orchestrator's overall conclusion is the union of the reusable jobs.
GitHub caps the number of reusable-workflow calls (~12 reliably), so heavier
checks run as standalone workflows on their own push triggers.

## 2. Workflow catalog

| Workflow                       | Trigger                              | Purpose                                                   |
| ------------------------------ | ------------------------------------ | --------------------------------------------------------- |
| `ci.yml`                       | PR / push / dispatch                 | Master orchestrator                                       |
| `contract.yml`                 | PR/push on `contracts/**` / dispatch | `buf format`, `buf lint`, `buf breaking`, OpenAPI Spectral |
| `type.yml`                     | PR/push/dispatch                     | TypeScript typecheck                                      |
| `lint.yml`                     | PR/push/dispatch                     | ESLint flat config + Prettier                             |
| `unit.yml`                     | PR/push/dispatch                     | Vitest unit tests                                         |
| `integration.yml`              | PR/push/dispatch                     | Vitest integration tests                                  |
| `smoke.yml`                    | PR/push/dispatch                     | API smoke tests                                           |
| `external-e2e.yml`             | PR/push/dispatch                     | External end-to-end                                       |
| `editor-e2e.yml`               | PR/push/dispatch                     | Editor Playwright e2e                                     |
| `a11y-i18n.yml`                | PR/push/dispatch                     | Accessibility + i18n                                      |
| `axe.yml`                      | PR/push/dispatch                     | axe-core a11y                                             |
| `chaos.yml`                    | dispatch                             | Chaos drills                                              |
| `p22-load.yml`                 | dispatch                             | Phase-22-beta k6 load tests                               |
| `load.yml`                     | push/schedule                        | Long-running load tests                                   |
| `perf-nightly.yml`             | schedule                             | Canvas FPS regression suite                               |
| `security.yml`                 | PR/push/dispatch                     | SAST/SCA/DAST pipeline (CodeQL, Semgrep, Trivy, Snyk, ZAP) |
| `leak-scan.yml`                | PR/push                              | gitleaks secret scan                                      |
| `threat-model-diff.yml`        | PR/push                              | Threat-model diff guard                                   |
| `tracing-coverage.yml`         | dispatch                             | OTel tracing coverage check                               |
| `build-provenance.yml`         | push/schedule                        | SLSA-style build provenance                               |
| `deploy.yml`                   | dispatch                             | Deployment                                                |
| `release.yml`                  | dispatch                             | Release cut                                               |
| `publish.yml`                  | dispatch                             | Package publish                                           |
| `dashboard-build.yml`          | PR/push/dispatch                     | Dashboard app build                                       |
| `schema-validate.yml`          | push/dispatch                        | JSON Schema validation                                    |
| `schema-migration-lint.yml`    | push/dispatch                        | Migration plan guard                                      |
| `public-beta-gate.yml`         | dispatch                             | Public-beta release gate                                  |
| `phase17-services-build.yml`   | dispatch                             | Phase-17 services build                                   |
| `setup-node.yml`               | workflow_call                        | Reusable Node setup                                       |

Plus reusable workflows under `.github/workflows/reusable/`.

## 3. Branch protection

Master + main are gated on the master orchestrator succeeding. PRs require
code-owner review (1 generally, 2 for security / data migrations / public
APIs). Pre-commit hooks (Husky) run Prettier and `buf format`.

## 4. Commit & PR conventions

- Conventional Commits
- Trunk-based; short-lived feature branches
- Lint-staged runs Prettier on TS/JS/JSON and `buf format` on `.proto`
