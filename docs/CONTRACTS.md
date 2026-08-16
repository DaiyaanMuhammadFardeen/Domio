# Domio — Contracts catalog

> **Source of truth:** `contracts/` directory, `buf.yaml`, `buf.gen.yaml`,
> `.spectral.yaml`. **Last regenerated:** 2026-08-16.

The contract rule (ADR-0002 + ADR-0003) is non-negotiable: every polyglot
boundary speaks gRPC internally and REST + OpenAPI externally. Generated
clients are **committed**, not regenerated per build.

## 1. Layout

```
contracts/
├── proto/          # Protobuf (Buf)  — internal gRPC wire formats
├── openapi/        # OpenAPI 3.1     — external REST wire formats
├── schema/         # JSON Schema     — domain objects (decks, components, CRDT ops)
├── graphql/        # GraphQL         — dashboard surface
├── mcp/            # JSON-RPC 2.0    — agent surface (Model Context Protocol)
├── events/         # Event envelope schemas (Kafka + NATS JetStream)
├── webhooks/       # Outbound webhook payload schemas
├── scorm/          # SCORM packaging schemas
├── VERSION         # Contract version pin
├── CHANGELOG.md    # Wire-format change log
└── README.md
```

## 2. Proto (`contracts/proto/domio/`)

**29 files** (as counted on master). Examples:

| Path                                                          | Purpose                              |
| ------------------------------------------------------------- | ------------------------------------ |
| `v1/{deck, common, health, font, theme, brand, license}.proto`| Core platform                        |
| `v1/{templates, lint, locks, library_sync, mcp_components}.proto` | Editor & components               |
| `v1/{recording, audience, analytics, ab}.proto`               | Audience + analytics                 |
| `v1/{marketplace, marketplace_billing, marketplace_creator, marketplace_curated, marketplace_takedown}.proto` | Commerce          |
| `ai/v1/ai.proto`                                              | AI platform                          |
| `branch/v1/branch.proto`                                      | Git-like deck branching              |
| `checkpoint/v1/checkpoint.proto`                              | Versioned checkpoints                |
| `controlplane/v1/command.proto`                               | Control-plane command bus            |
| `diff/v1/diff.proto`                                          | Document diff primitives             |
| `merge/v1/merge.proto`                                        | Three-way merge                      |
| `realtime/v1/realtime.proto`                                  | Realtime session types               |

## 3. OpenAPI (`contracts/openapi/`)

**63 documents** covering every external surface (apps + services with HTTP
APIs). Linted with Spectral (`.spectral.yaml`).

## 4. JSON Schema (`contracts/schema/`)

### v1 domain (61 files) — domain objects and CRDT ops

`deck.schema.json`, `scene-graph.schema.json`, `slide.schema.json`,
`theme.schema.json`, `design-token-v1.schema.json`, `brand-kit-v1.schema.json`,
`component-package-v1.schema.json`, `placeholder-logic`,
`crdt-op.schema.json`, `presence-state.schema.json`,
`chart-binding-v1.schema.json`, `scenario-v1.schema.json`,
`variable-binding-v1.schema.json`, `conditional-rule-v1.schema.json`,
`variable-v1.schema.json`, `query-v1.schema.json`,
`animation-export-v1.schema.json`, `animation-preset-v1.schema.json`,
`easing-curve-v1.schema.json`, `keyframe` data, `reduced-motion-v1.schema.json`,
`transition-v1.schema.json`, `magic-move-v1.schema.json`,
`camera-keyframe-v1.schema.json`, `model-asset-v1.schema.json`,
`shader-v1.schema.json`, `lottie-asset-v1.schema.json`,
`video-asset-v1.schema.json`, `audio-track-v1.schema.json`,
`font-asset-v1.schema.json`, `annotation-v1.schema.json`,
`latex-doc-v1.schema.json`, `state-machine-v1.schema.json`,
`deep-link-v1.schema.json`, `deep-link-payload-v1.schema.json`,
`embed-policy-v1.schema.json`, `interaction-state-v1.schema.json`,
`hotspot-v1.schema.json`, `overlay-v1.schema.json`,
`branching-edge-v1.schema.json`, `presentation-sequence-v1.schema.json`,
`prototype-event-v1.schema.json`, `prototype-session-v1.schema.json`,
`threshold-rule-v1.schema.json`, `map-style-v1.schema.json`,
`code-sandbox-policy-v1.schema.json`,
`marketplace-listing-v1.schema.json`, `marketplace-license-v1.schema.json`,
`marketplace-payout-v1.schema.json`, `creator-profile-v1.schema.json`,
`license-v1.schema.json`, `ar-session-v1.schema.json`,
`xapi-statement-v1.schema.json`, `quiz-v1.schema.json`,
`mock-data-v1.schema.json`, `timeline-v1.schema.json`,
`scene-v1.schema.json`, `deck-placeholder.schema.json`,
`common.schema.json`, `common-3d-motion-media-v1.schema.json`.

### CRDT (`crdt/`)

`deck-root.schema.json`, `slide.schema.json`, `theme.schema.json`.

### Merge (`merge/`)

`diff_summary.schema.json`.

## 5. GraphQL (`contracts/graphql/v1/`)

`analytics.graphql` — the dashboard's GraphQL surface.

## 6. MCP (`contracts/mcp/`)

The agent surface. **8 tool specs** (input + output JSON Schemas):

| Tool                   | Purpose                                            |
| ---------------------- | -------------------------------------------------- |
| `lint_deck`            | Run all lints (off-brand, a11y, stale data)        |
| `semantic_search`      | Cross-deck semantic search                         |
| `accessibility_audit`  | Accessibility audit (WCAG 2.2 AA)                  |
| `check_freshness`      | Stale-stats detection                              |
| `get_claim_confidence` | Confidence scoring per claim                       |
| `get_provenance`       | Stat lineage: source / query / owner / last-verified |

Plus `prototyping.tools.json` (the prototyping tool catalog) and `README.md`.

> Wire format: JSON-RPC 2.0 over HTTP/HTTPS. The server is in Go
> (`services/mcp-server/`), built per Phase 13 M1; the original TS stub is
> retained for backward compatibility.

## 7. Events (`contracts/events/`)

Event envelope schemas for Kafka + NATS JetStream. Used by every analytics
ingest path and the cross-service event bus.

## 8. Webhooks (`contracts/webhooks/`)

Outbound webhook payload schemas (deck viewed, comment added, approval
granted, etc.).

## 9. SCORM (`contracts/scorm/`)

SCORM packaging schemas for LMS export workflows.

## 10. Tooling

| Tool          | Version  | Purpose                                       |
| ------------- | -------- | --------------------------------------------- |
| Buf           | 1.34.0   | `buf format`, `buf lint`, `buf breaking`      |
| protoc        | 25.3     | Underlying compiler                           |
| Spectral      | (`.spectral.yaml`) | OpenAPI linting in CI                |
| AJV           | 8.17.1   | JSON Schema validation at runtime             |
| ajv-formats   | 3.0.1    | JSON Schema format support                    |

CI workflow: `.github/workflows/contract.yml` runs `buf format`,
`buf lint`, `buf breaking`, OpenAPI Spectral, and AJV validation.

## 11. Versioning

`contracts/VERSION` is the wire-format pin. Phase 18 (`phase-18-contracts-v1.0.0`)
and Phase 19 (`phase-19-contracts-v1.0.0`) have been tagged on `master`. The
`schema-migration-lint.yml` workflow guards against breaking changes landing
without a migration plan.
