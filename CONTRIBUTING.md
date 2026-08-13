# Contributing to Domio

> **Welcome.** Domio is a large, multi-discipline platform. This guide explains how to land work without breaking the foundation.

---

## Code of conduct

All contributors are expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md). Be respectful, assume good faith, and prioritise the platform's long-term health over local wins.

---

## Branching strategy

- **Trunk-based development.** `main` is always green.
- **Short-lived feature branches.** Branch from `main`, PR back to `main`, merge within 1–3 days.
- **No long-lived GitFlow branches.** Releases are tags, not branches.
- **Branches named** `<type>/<short-kebab-summary>` (e.g., `feat/canvas-pen-tool`, `fix/crdt-divergence`, `docs/adr-009-polyglot`).

---

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/). Required types:

| Type       | When to use                                              |
| ---------- | -------------------------------------------------------- |
| `feat`     | New user-visible feature.                                |
| `fix`      | Bug fix.                                                 |
| `docs`     | Documentation only.                                      |
| `refactor` | Code change that neither fixes a bug nor adds a feature. |
| `perf`     | Performance improvement.                                 |
| `test`     | Adding or refining tests.                                |
| `build`    | Build system / dependency changes.                       |
| `ci`       | CI configuration.                                        |
| `chore`    | Other changes that don't modify src or test files.       |
| `revert`   | Revert a previous commit.                                |

Format: `<type>(<scope>): <subject>`. Scope is the package or service name (e.g., `feat(editor): add pen-tool Bezier handles`). Subject is imperative, ≤ 72 chars, no period.

Body explains **why**, not what. Footer references FR/NFR IDs (`Refs: FR-ED-42, NFR-PERF-04`) and breaks any `BREAKING CHANGE:` for `feat!`.

---

## Pull requests

- **Small.** PRs should be reviewable in < 30 minutes. Split large work.
- **One logical reason per PR.** Multiple unrelated changes get rejected.
- **PR template** (auto-applied) requires:
  - [ ] FR / NFR IDs linked.
  - [ ] Acceptance criteria updated.
  - [ ] Tests added (unit + integration + E2E where applicable).
  - [ ] Performance impact discussed.
  - [ ] Accessibility + i18n considered.
  - [ ] Threat-model impact considered.
  - [ ] Migration / rollback if schema changes.
  - [ ] Domain doc / API docs / runbook updated.
  - [ ] Feature flag has owner and expiry.
- **Reviews**: minimum 1 code owner; 2 for security / data migrations / public APIs.
- **Author responds to all blocking comments.** Resolve threads before merge.
- **Merge**: squash-merge for product code; preserve ADR and migration history. No force-push on protected branches.

---

## Releases

- **Semantic versioning** for packages and APIs.
- **Release tags** are immutable.
- **Backports** only for security and critical production fixes; documented in the release notes.

---

## Code style

- **TypeScript**: ESLint config in `eslint.config.mjs`, Prettier integration.
- **Go**: `gofumpt`, `golangci-lint`, `staticcheck`.
- **Python**: `ruff format`, `ruff check`, `mypy --strict`.
- **Rust**: `cargo fmt`, `cargo clippy --deny warnings`.
- **Protobuf**: `buf format` + `buf lint`.
- **Markdown**: Prettier with `printWidth: 80` and `proseWrap: preserve`.

CI enforces all of these. PRs that fail lint don't merge.

---

## Module ownership

Every directory under `apps/`, `services/`, `workers/`, `packages/` has a team owner declared in `CODEOWNERS`. The current ownership map is committed in `.github/CODEOWNERS`.

If your PR touches a directory you don't own, request a review from the CODEOWNERS entry. The owning team has the final say on contracts that affect their module.

---

## Contracts

All wire-format changes go through `contracts/`:

- **Protobuf**: `buf lint` + `buf breaking --against '.git#branch=main'` in CI.
- **OpenAPI**: `redocly lint` in CI.
- **JSON Schema**: AJV validation in CI.

Breaking changes require an ADR (see `docs/adr/0000-template.md`). Backwards-compatible changes require a 24-hour review window in `#domio-contracts`; silence = consent.

**Generated clients are committed.** Re-run `pnpm gen` after touching `contracts/`. Never re-implement generated code by hand.

---

## Database migrations

- Migrations live in `apps/api/migrations/` and are owned by the platform team.
- New tables / columns must include `tenant_id`, `created_at`, `updated_at`, and standard audit columns.
- Row-Level Security policies are mandatory for every multi-tenant table.
- Column drops are forbidden in the first 12 months of a column's life.
- Backfills require a separate migration, a feature flag, and a rollback plan in the PR description.

---

## Telemetry

Every cross-service feature emits OTel spans and structured logs. Metric naming: `<domain>.<entity>.<verb>` (e.g., `theme.applied.count`, `data.query.duration_ms`).

If you add a new metric, add a dashboard panel and a runbook entry.

---

## Feature flags

Every cross-service feature ships behind a feature flag. Flags:

- Have an owner (the destination capability).
- Have an expiry date.
- Default to `off` in production until a design-partner demo has passed.
- Live in `feature_flag_service` (Hono + Postgres) with a read-through cache.

---

## Where to ask

- **Conventions / contracts / gates**: `#domio-engineering` Slack.
- **Architecture questions**: `#domio-architecture` Slack or the Architecture Council (weekly Thursday 10:00).
- **Security questions**: `#domio-security` Slack.
- **A11y questions**: `#domio-a11y` Slack.
- **Bangladesh / localization**: `#domio-bd` Slack.

---

_End of CONTRIBUTING.md._
