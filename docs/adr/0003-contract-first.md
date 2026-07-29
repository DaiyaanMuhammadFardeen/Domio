# ADR-0003: Contract-first wire formats with generated clients committed

## Status

`accepted`

## Date

2026-07-29

## Context

Multiple services in different runtimes must agree on the shape of the
data they exchange. Drift between the schema definition and the
generated client is a production bug. Drift between the schema and the
hand-written client is a worse bug.

Two patterns compete:

1. **Schema-first (contract-first).** Author the `.proto` / `.yaml` /
   `.json`; generate the client code; commit the client.
2. **Code-first.** Author types in each language; share via a meta-tool
   (e.g., Protobuf reflection, tRPC, ts-rest, OpenAPI server generators).

The code-first pattern wins on ergonomics for pure-TypeScript stacks.
The schema-first pattern wins on polyglot stacks because:

- **One source of truth** for the wire format, regardless of consumer.
- **Buf breaking-change gates** catch incompatibilities in CI.
- **Generated clients are deterministic**; no human pattern-matching.
- **Adoption by new runtimes is mechanical**: regenerate, no code.

## Decision

We adopt **schema-first** for all cross-service wire formats:

| Format | Source | Consumers |
|---|---|---|
| Protobuf | `contracts/proto/domio/v1/*.proto` | All Go, Python, Rust services + TS services via grpc-js. |
| OpenAPI | `contracts/openapi/v1/*.yaml` | External REST clients + TypeScript via `openapi-typescript`. |
| JSON Schema | `contracts/schema/v1/*.json` | Document-shaped data: deck schema, theme schema, plugin manifest. |

**Generated clients are committed**, not generated on demand:

- `packages/api-client/src/gen/` — TypeScript.
- `gen/go/` — Go (used by every Go service).
- `gen/python/` — Python (used by ai-sdk-py, eval harnesses).
- `gen/rust/` — Rust (used by hot-path workers when they exist).

The generators are wired via `buf.gen.yaml` with **pinned versions**:

```
buf.build/protocolbuffers/js@v3.21.2
buf.build/protocolbuffers/go@v3.21.2
buf.build/protocolbuffers/python@v3.21.2
buf.build/protocolbuffers/rust@v3.21.2
```

Regeneration is part of every contract change:

```bash
pnpm gen          # all generators
pnpm gen:proto    # just proto
pnpm gen:openapi  # just openapi
pnpm gen:schema   # just json-schema
```

CI gates:

- `buf lint` — style + lint.
- `buf breaking --against '.git#branch=main'` — no breaking changes within
  a major version.
- `redocly lint` — OpenAPI style.
- `ajv --spec=json-schema-2020-12` — JSON Schema validation.
- A "generated clients are up to date" check that runs `pnpm gen --check`
  and fails if the diff is non-empty.

## Alternatives considered

- **Code-first with ts-rest / tRPC.** Rejected: locks the front-end to a
  single TypeScript topology; doesn't cover the Go realtime gateway or the
  Python AI workers.
- **Schema-first but only generate at build time.** Rejected: every
  consumer pays the regeneration cost; reproducibility erodes.
- **Hand-written clients per language.** Rejected: the security and
  consistency costs scale with the number of services and are
  categorically worse than the cost of regenerating.

## Consequences

**Easier:**

- One source of truth per wire format; tooling enforces consistency.
- Adding a new service in a new language is "regenerate, import, call."
- Schema review happens in PR diffs of `.proto` files; humans can
  understand the change.

**Harder:**

- Generated clients are part of the repo's review surface; reviewers
  must tolerate large diffs.
- Protobuf has a learning curve for engineers coming from REST-only.
- Regeneration must happen in CI on every contract change.

**New obligations:**

- Every contract directory has a CI gate (lint, breaking, validation).
- Protobuf's `buf.yaml` is authoritative for lint rules.
- `.proto` files are formatted by `buf format` on save.
- Generated files are marked `linguist-generated` in `.gitattributes`.

## Security / privacy

- Every Protobuf message that carries user data declares
  `[(validate.rules).string = {min_len: 1, max_len: …}]` via
  `protoc-gen-validate`. CI enforces.
- Every REST endpoint requires an `Idempotency-Key` header for state-
  changing verbs; this is declared in OpenAPI.
- Generated clients inherit security behaviour; we cannot accidentally
  omit a header.

## Data migration / rollback

Schema changes are backwards-compatible within a major version. A major
version bump requires:

- An ADR recording the bump.
- A migration plan with feature flag + dual-write window.
- A deprecation note in `/docs/release-notes/`.

Rollback = revert the schema PR + revert all service PRs that consumed
the new field.

## Verification

- [ ] `contracts/proto/` is Buf-managed; `buf.yaml` is committed.
- [ ] `pnpm gen` is reproducible: same output on every run on the same
      node + Buf version.
- [ ] CI fails on breaking Protobuf changes.
- [ ] No service imports `.pb.go` / `.pb.cc` / `_pb2.py` from another
      service's source tree.

## Owners

- Principal architect (governance).
- Platform team (CI gates, generated-client refresh).

## Cross-references

- Supersedes: nothing.
- Superseded by: nothing.
- Related: `docs/04-system-architecture.md` §6.2.0 (Contract Rule),
  `docs/06-technology-stack.md` §6.2.0, ADR-0001, ADR-0002.