# ADR-0002: Adopt a polyglot backend with a non-negotiable contract rule

## Status

`accepted`

## Date

2026-07-29

## Context

Domio's runtime is heterogeneous by design:

- **Control plane** (HTTP + REST + gRPC server, modular monolith, business
  modules, AI orchestration, MCP server) — TypeScript on Node 22.
- **Realtime gateway** (CRDT presence, stage fan-out, audience channels,
  presenter signaling) — Go on `gorilla/websocket` + NATS.
- **CPU workers** (export pipeline, render, media transcodes, formula
  evaluation, snapshotter) — Go primary, Rust for hot paths.
- **AI / data workers** (model adapters, dataset prep, eval, ingestion) —
  TypeScript primary, Python for ML/eval.

Forcing a single language across all tiers would compromise each tier
for the sake of uniformity. The cost of polyglot is real: more toolchains,
more generated clients, more on-call surface. The decision is whether the
benefit at each tier exceeds the cost.

## Decision

We adopt a **polyglot backend** with the following tier-by-tier language
commitment:

| Tier                   | Language    | Runtime                  | Why                                                                                                 |
| ---------------------- | ----------- | ------------------------ | --------------------------------------------------------------------------------------------------- |
| Control plane          | TypeScript  | Node 22 + Hono           | Type sharing with editor / MCP / CLI / SDK; fastest iteration on business logic; large hiring pool. |
| Realtime gateway       | Go 1.23     | gorilla/websocket + NATS | Memory-efficient per-WebSocket connection; concurrency primitives fit fan-out.                      |
| CPU workers (primary)  | Go 1.23     | nats.go + container      | Same team as gateway; fast iteration.                                                               |
| CPU workers (hot path) | Rust 1.82   | axum + prost             | Profiling-justified escape hatch (see §6).                                                          |
| AI orchestrator        | TypeScript  | Node 22                  | Shares types with the control plane.                                                                |
| ML / eval              | Python 3.12 | uv + Pydantic            | Standard ML ecosystem; eval harnesses.                                                              |

**The contract rule is non-negotiable:**

1. Every polyglot boundary speaks **gRPC** for internal traffic and
   **REST + OpenAPI** for external traffic.
2. Protobuf is committed in `contracts/proto/`. OpenAPI is committed in
   `contracts/openapi/`. JSON Schema is committed in `contracts/schema/`.
3. **Generated clients for TS, Go, Python, and Rust are committed** to the
   monorepo and never re-implemented by hand.
4. **No service imports another service's source code.** Service contracts
   are the only allowed coupling.
5. Schema changes go through Buf breaking-change checks (CI) and are
   backwards-compatible within a major version.
6. Cross-service feature flags and experiments travel through the same
   shared event bus (NATS JetStream).

## Alternatives considered

- **All TypeScript.** Rejected: Node's per-WebSocket memory footprint is
  ~10× Go's for the same fan-out. Real-time presence at 10k audience scale
  is the bottleneck; we cannot hand-wave that.
- **Java + Spring Boot.** Rejected: high boilerplate, slow iteration, large
  JVM memory footprint. Java's GC pauses are unacceptable for the realtime
  tier.
- **All Go.** Rejected: loses type sharing with the editor and the SDK
  ecosystem (Zod, tRPC, MCP server SDK). Iterating on business logic in
  Go is slower than in TypeScript for the same team.
- **.NET.** Rejected: small hiring pool in our target geographies.

## Consequences

**Easier:**

- Each tier is optimised for its workload.
- Types are shared between the editor and the control plane (TypeScript).
- Realtime gateway scales to 10k audience cheaply (Go).
- Hot paths can be extracted to Rust without a full rewrite.

**Harder:**

- Four toolchains to maintain (Node, Go, Rust, Python).
- Generated clients are co-evolved with schemas; re-generation is part of
  every contract change.
- CI runs four lint + test suites per PR.
- On-call rotation must cover the relevant runtimes.

**New obligations:**

- All cross-runtime contracts are versioned (Protobuf + OpenAPI).
- Every service has a `README.md` that documents its runtime, owner, and
  contract surface.
- The Architecture Council reviews Rust adoption per-service (ADR per
  escape hatch).

## Security / privacy

No new attack surface from polyglot, but the toolchain diversity means
each runtime's security advisories must be tracked. The platform team
owns the dependency-update automation (Dependabot + Renovate).

## Data migration / rollback

Adopting Rust in a hot path is a per-service ADR. Rollback is "delete the
Rust crate and route to the Go worker."

## Verification

- [ ] `contracts/proto/` is the authoritative wire format.
- [ ] `buf lint` and `buf breaking` are green in CI.
- [ ] No `import "../../../services/X"` exists in any service.
- [ ] Generated clients at `gen/go/`, `packages/api-client/src/gen/`,
      `gen/python/`, `gen/rust/` are committed and not gitignored.
- [ ] Each service has a `README.md` declaring its runtime.

## Owners

- Principal architect (governance).
- Platform team (toolchain + contracts CI).
- Per-service tech lead (runtime-specific decisions).

## Cross-references

- Supersedes: ADR-0001's "we'll figure out the runtime" implicit assumption.
- Superseded by: nothing.
- Related: `docs/04-system-architecture.md`, `docs/06-technology-stack.md`,
  ADR-0001, ADR-0003.
