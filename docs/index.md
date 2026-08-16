# Domio Documentation

> **This index is the entry point.** It points at the rebuilt docs that
> were regenerated from the live code on `master` (commit `649d3f7`,
> 2026-08-14). The legacy super-docs and per-feature mega-docs
> (pre-rebuild) have been archived under `docs/archive/pre-rebuild/`.
> **Last regenerated:** 2026-08-16.

## 1. Start here

| If you want to…                                  | Read                                                                  |
| ------------------------------------------------ | --------------------------------------------------------------------- |
| See what's actually shipped right now             | [`STATUS.md`](STATUS.md)                                              |
| Understand the system architecture                | [`ARCHITECTURE.md`](ARCHITECTURE.md)                                  |
| Map every doc to its live or planning status      | [`CONSOLIDATED.md`](CONSOLIDATED.md) — this index's parent map        |
| Browse services / apps / workers / packages       | [`SERVICES.md`](SERVICES.md) · [`APPS.md`](APPS.md) · [`WORKERS.md`](WORKERS.md) · [`PACKAGES.md`](PACKAGES.md) |
| Understand the wire formats                       | [`CONTRACTS.md`](CONTRACTS.md)                                        |
| Understand CI                                      | [`CI.md`](CI.md)                                                      |
| Understand infra (Terraform/Helm/local)            | [`INFRASTRUCTURE.md`](INFRASTRUCTURE.md)                              |
| Understand observability (SLOs/dashboards/PD)     | [`OBSERVABILITY.md`](OBSERVABILITY.md)                                |
| Understand the security model                      | [`SECURITY.md`](SECURITY.md)                                          |
| Understand the front-end apps                      | [`FRONTEND.md`](FRONTEND.md)                                          |

## 2. Per-phase planning context (legacy, not status)

These are the original planning docs written before the code was built.
Each carries a banner pointing at `STATUS.md`. Don't read them as a
status report — read them as the original spec.

- All phases 0–22-beta live under [`development_phases/`](development_phases/).
- One **exception** is genuinely live: `development_phases/phase-20.5-IMPLEMENTATION-STATUS.md` was hand-written against the current
  code with a per-file shipment table and verification matrix.

## 3. Architecture Decision Records (authoritative)

[`adr/`](adr/) contains all accepted ADRs (0001–0008 plus the template
0000). ADRs are immutable; superseded ones link to their replacements.

## 4. Operational docs (live, co-located with code)

These live at the repo root or in operational folders; the live docs
above cross-link to them.

- `runbooks/` — operational playbooks, postmortems, chaos drills, tabletop tests
- `slo/` — SLOs, alert rules, `oncall.yaml`
- `threat-model/` — per-component threat models
- `infrastructure/` — Terraform, Helm, ClickHouse, Kafka, Grafana,
  PagerDuty, feature-flags, CDN, status-page, synthetics, ArgoCD

## 5. Run / deploy

- Root [`README.md`](../README.md) — quick start + features overview
- [`DOCKER.md`](../DOCKER.md) — full containerized workflow

## 6. Archived / pre-rebuild

- [`archive/pre-rebuild/`](archive/pre-rebuild/) — the old
  `docs/01–12.md` super-docs and the per-feature mega-docs
  (`docs/editor-canvas.md`, `docs/3d-motion-media.md`, etc.). Kept only
  for historical reference; superseded by `SERVICES.md`, `APPS.md`,
  `PACKAGES.md`, `CONTRACTS.md`, etc.
