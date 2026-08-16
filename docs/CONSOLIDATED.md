# Domio — Documentation map

> **Ground truth:** every claim in any other doc must be reconciled with
> `docs/STATUS.md` (live) and `docs/ARCHITECTURE.md` (live). Phase planning
> docs in `docs/development_phases/` are **planning context only**.
> **Last regenerated:** 2026-08-16.

## 1. Read-first (live, regenerated from code)

| File                              | What it tells you                                                |
| --------------------------------- | ---------------------------------------------------------------- |
| `docs/STATUS.md`                  | What is shipped on master right now (per phase).                |
| `docs/ARCHITECTURE.md`            | Layered topology, polyglot rule, contract rule.                  |
| `docs/SERVICES.md`                | Service-by-service catalog (84 entries).                         |
| `docs/APPS.md`                    | Front-end apps catalog (11 entries).                             |
| `docs/WORKERS.md`                 | Worker / batch job catalog (23 entries).                         |
| `docs/PACKAGES.md`                | Shared package catalog (38 entries).                             |
| `docs/CONTRACTS.md`               | Wire-format catalog (Proto, OpenAPI, JSON Schema, GraphQL, MCP). |
| `docs/CI.md`                      | CI workflow catalog (30 workflows).                              |
| `docs/INFRASTRUCTURE.md`          | Terraform / Helm / ClickHouse / Kafka / observability.           |
| `docs/OBSERVABILITY.md`           | SLOs, dashboards, PagerDuty, runbooks.                           |
| `docs/SECURITY.md`                | Threat model, RBAC+ABAC, audit, DLP, rate-limit, web-security.   |
| `docs/FRONTEND.md`                | Front-end stack and per-app deep dives.                          |
| `docs/CONSOLIDATED.md` (this)     | Map of every doc to its live status.                             |

## 2. Per-phase planning context (legacy, not status)

These files are **not** live status. They are the original planning docs
written before the code was built. Each carries a banner pointing at
`docs/STATUS.md`.

```
docs/development_phases/
├── README.md
├── parallelization.md
├── phase-00-repo-contracts-dev-env.md
├── phase-01-observability-cicd-infra-baseline.md
├── phase-02-deck-schema-scene-graph.md
├── phase-03-canvas-editor-mvp.md
├── phase-04-realtime-collab-crdt.md
├── phase-05-persistence-versioning-branches.md
├── phase-06-components-and-templates.md
├── phase-07-theming-brand-design-tokens.md
├── phase-08-live-data-and-interactive-charts.md
├── phase-09-animation-and-transition-system.md
├── phase-10-prototyping-and-interactivity.md
├── phase-11-3d-motion-media.md
├── phase-12-ai-copilot-foundation.md
├── phase-13-agentic-programmable-interfaces.md
├── phase-14-sharing-publishing-deck-as-website.md
├── phase-15-presenter-experience.md
├── phase-16-audience-participation.md
├── phase-17-analytics-and-engagement-intelligence.md
├── phase-17-commit-log.md
├── phase-17-dod.md
├── phase-17-spec.md
├── phase-17-verification.md
├── phase-18-collaboration-and-workflow.md
├── phase-19-marketplace.md
├── phase-20-security-enterprise.md
├── phase-20.5-beta-security-hardening.md
├── phase-20.5-IMPLEMENTATION-STATUS.md      ← actually live-derived (Phase 20.5 only)
├── phase-21-novel-and-frontier-features.md
├── phase-22-beta-hardening.md
└── phase-22-polish-scale-hardening-ga.md
```

### Exceptions worth keeping

- `phase-20.5-IMPLEMENTATION-STATUS.md` is **the one** phase doc that is
  live-derived (Phase 20.5 B1–B6 with code citations and verification
  matrix). It is a good template for what a "live" phase doc should look
  like, but no other phase doc is in the same state.
- `docs/adr/` — Architecture Decision Records are append-only and
  authoritative for the decisions they capture (don't rewrite them).

## 3. Archival / pre-rebuild

The legacy **super-docs** (`docs/01–12.md`) and the feature-domain
mega-docs (`docs/editor-canvas.md`, `docs/3d-motion-media.md`, etc.) have
been moved to `docs/archive/pre-rebuild/`. They predate the code on
master and are kept only for historical reference. The new
category-first docs (`docs/SERVICES.md`, `docs/APPS.md`, …) supersede
them.

## 4. Front-end sub-docs

| File                              | What it covers                                  |
| --------------------------------- | ----------------------------------------------- |
| `docs/frontend/`                  | Front-end deep dives by surface                 |
| `docs/frontend-roadmap/`          | Front-end delivery roadmap                      |
| `docs/architecture/`              | Per-phase data-flow diagrams (e.g. phase-17)    |
| `docs/p22b/`                      | Phase 22b gap inventory (P21-dependent subset)  |
| `docs/slos/`                      | Per-SLO docs (forward of `slo/`)                |
| `docs/handoff/`                   | Cross-team handoff notes                        |
| `docs/runbooks/`                  | Operational runbooks (forward of `runbooks/`)  |

## 5. Operational docs (live, co-located with code)

| Location                    | What it covers                                       |
| --------------------------- | ---------------------------------------------------- |
| `runbooks/`                 | Operational runbooks + postmortems + chaos + tabletop |
| `slo/`                      | SLOs + alert rules + oncall.yaml                    |
| `threat-model/`             | Threat model + per-component pages + tests          |
| `infrastructure/feature-flags/` | Per-phase feature flag registry                  |
| `infrastructure/observability/` | Grafana + PagerDuty configs                     |
| `infrastructure/chaos/`     | Chaos drill definitions                              |
| `infrastructure/loadtest/`  | k6 + Locust scripts                                  |
| `infrastructure/synthetics/` | Synthetic probes                                    |
| `infrastructure/cdn/`       | CDN config + cache plans                             |
| `infrastructure/status-page/` | Status page config                                 |
| `infrastructure/argocd/`    | ArgoCD app-of-apps + projects                        |
| `infrastructure/local/`     | Local-dev infra (compose, Prometheus, OTel)          |

## 6. Useful one-liners

- **"Is this thing shipped?"** → `docs/STATUS.md`
- **"What does this service do?"** → `docs/SERVICES.md`
- **"What does this app do?"** → `docs/APPS.md`
- **"How does the wire format work?"** → `docs/CONTRACTS.md`
- **"How does CI gate this?"** → `docs/CI.md`
- **"Why was this decision made?"** → `docs/adr/`
- **"What was the original plan for phase X?"** → `docs/development_phases/phase-XX.md`
- **"How do I run this locally?"** → root `README.md` + `DOCKER.md`
