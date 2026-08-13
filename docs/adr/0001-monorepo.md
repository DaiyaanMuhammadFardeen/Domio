# ADR-0001: Adopt a single monorepo with polyglot toolchains

## Status

`accepted`

## Date

2026-07-29

## Context

Domio is a multi-tier platform: a TypeScript control plane, a Go realtime
gateway, Go/Rust data-plane workers, Python ML/AI workers, multiple web
apps (editor, viewer, presenter, audience), and a shared design system. The
codebase must be navigable, buildable, and versioned as a single unit
because:

- **Tight contract coupling.** TypeScript types, Protobuf messages, and
  OpenAPI schemas are shared across runtimes. A drift between the proto
  definition and the generated client is a production bug.
- **Cross-team work.** Up to 35 engineers at peak will work on the same
  product. Visibility across the codebase reduces duplicated effort and
  integration friction.
- **Atomic refactors.** Renaming a proto field across the editor, the API,
  the realtime gateway, and the docs must be a single PR.

The alternative is a polyrepo: one repo per service. This was considered
and rejected because contract drift becomes a coordination tax that grows
quadratically with the number of services.

## Decision

We adopt a **single monorepo** at the root of this repository, with all
production code, planning docs, infrastructure definitions, and tooling
co-located.

```
apps/        # User-facing surfaces
services/    # Long-running servers
workers/     # Batch / queue consumers
packages/    # Shared libraries
contracts/   # Wire-format source of truth
infrastructure/  # Terraform, Helm, Dockerfiles
docs/        # Planning + ADRs + runbooks
scripts/     # Local dev scripts
tools/       # Internal tooling
```

The monorepo is orchestrated by:

- **pnpm workspaces** for the TypeScript / JavaScript packages.
- **Turborepo** for task-graph orchestration across all languages
  (`build`, `lint`, `test`, `typecheck`, `gen`, `clean`).
- **Go modules** (one module at the root, with paths into `services/`,
  `workers/`, `gen/go/`).
- **Cargo workspaces** for Rust (when they exist).
- **uv / Poetry workspaces** for Python (when AI workers land).

Tooling is pinned in `.tool-versions` (asdf) so every developer and CI
runner lands on the same Node, Go, Python, Rust, Buf, Protoc, and Helm
versions.

## Alternatives considered

- **Polyrepo (one repo per service).** Rejected: contract drift, atomic
  refactors impossible, cross-team PRs are blocked on multiple reviews.
- **Bazel.** Rejected: high learning curve, slow to bootstrap, and the
  value doesn't pay off until the codebase is much larger than ours.
- **Nx.** Rejected: solid, but pnpm + Turborepo is leaner and more
  idiomatic for the TypeScript-heavy stack we're committing to.
- **Rush.** Rejected: Microsoft's toolchain works but adds boilerplate
  without commensurate benefit.

## Consequences

**Easier:**

- Single `git clone` for the entire platform.
- Cross-runtime refactors stay atomic.
- CI sees all code; one PR can fix a bug across the editor, the API, and
  the gateway.
- Generated clients are committed alongside the contracts that produce
  them.

**Harder:**

- Repo size grows over time. We mitigate with Turbo's caching and
  sparse-checkout docs in `CONTRIBUTING.md`.
- CODEOWNERS must be carefully scoped so the right people review.
- Bisecting a regression across all packages requires `git log --` paths.

**New obligations:**

- Every directory under `apps/`, `services/`, `workers/`, `packages/`
  must declare an owner in `CODEOWNERS`.
- Generated code is committed. Re-run `pnpm gen` after touching
  `contracts/`.
- `pnpm-workspace.yaml` and `turbo.json` are load-bearing; don't edit
  without an ADR.

## Security / privacy

No direct security implications. The single repo does mean that a
vulnerability in one component is visible to all engineers, which is
desirable.

## Data migration / rollback

This is a greenfield decision. No migration. Rollback is "delete the
repo and start over with a different structure."

## Verification

- [ ] `pnpm install` succeeds on a clean clone.
- [ ] `turbo run build` produces build artifacts for every package.
- [ ] `go test ./...` passes at the root.
- [ ] `cargo check --workspace` passes (when Rust lands).
- [ ] `.tool-versions` matches the toolchain installed by `asdf install`.
- [ ] CI green on PR #1.

## Owners

- Principal architect (governance).
- Platform team (toolchain maintenance).

## Cross-references

- Supersedes: nothing.
- Superseded by: nothing.
- Related: `docs/04-system-architecture.md`, `docs/06-technology-stack.md`,
  `CONTRIBUTING.md`.
