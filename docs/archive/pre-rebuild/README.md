# Archived — pre-rebuild docs

> **These files are kept only for historical reference.**
> They predate the documentation rebuild on 2026-08-16 and were
> superseded by the new category-first docs at `docs/` root:
> `STATUS.md`, `ARCHITECTURE.md`, `SERVICES.md`, `APPS.md`, `WORKERS.md`,
> `PACKAGES.md`, `CONTRACTS.md`, `CI.md`, `INFRASTRUCTURE.md`,
> `OBSERVABILITY.md`, `SECURITY.md`, `FRONTEND.md`, `CONSOLIDATED.md`.

## What this archive contains

- The legacy **super-docs** (`01–12.md`) covering problem statement,
  requirements, UX, architecture, data, stack, security, infra, testing,
  team, and legal (BD).
- The legacy **feature-domain mega-docs** written when the project was
  still a planning artifact: `editor-canvas.md`, `3d-motion-media.md`,
  `agentic-interfaces.md`, `ai-copilot.md`, `analytics.md`,
  `animation-transitions.md`, `audience-participation.md`,
  `collaboration-workflow.md`, `components-templates.md`,
  `enterprise-governance.md`, `live-data-charts.md`, `novel-frontier.md`,
  `presenter-experience.md`, `prototyping-interactivity.md`,
  `sharing-publishing.md`, `theming-branding.md`.
- Runbook-style snapshots (`analytics-runbook.md`,
  `collaboration-runbook.md`, `marketplace-runbook.md`) and the original
  `mcp-server.md`, `phase-16-compliance.md`, `phase14-w1.md`.

## Why they were archived

These documents were written before the codebase was built (initial
commit 2026-07-29). By 2026-08-16 the code on `master` had drifted well
past them and they conflicted with reality — in particular they made
claims about which phases were complete that the live `master` does not
support.

The rebuild docs (`docs/STATUS.md` + `docs/ARCHITECTURE.md` + the
category catalogs) are derived directly from the filesystem and from the
git log, and are the source of truth going forward.

## How to handle these files

- **Do not** link to them from new docs.
- **Do not** delete them — the ADRs in `docs/adr/` and the per-phase
  planning docs in `docs/development_phases/` reference historical
  context that lives here.
- If a claim in one of these files turns out to be needed, port the
  relevant paragraph into the appropriate new doc
  (`docs/STATUS.md` first, then the category catalog), and link here.
