# Domio — Packages (shared libraries)

> **Source of truth:** `packages/` (38 entries). **Last regenerated:** 2026-08-16.

All packages are workspace-published (`workspace:*` in `pnpm-lock.yaml`).
They are the **only** allowed coupling between services — services never
import each other's source code (ADR-0002).

## Editor / runtime

- `canvas` — WebGL2/WebGPU/Canvas2D scene graph
- `schema` — typed deck schema + JSON Schema codegen
- `yjs-shared` — CRDT bindings + presence primitives
- `schema-prop` — prop schema helpers
- `components` — shared React components
- `ui` — UI primitives
- `animation-runtime` — animation runtime
- `easing` — bezier easing curves
- `physics` — physics primitives
- `prototype-runtime` — variables / conditionals / hotspots runtime
- `prototype-recorder` — prototype recorder
- `tokens` — design tokens

## Content & data

- `chart` — chart components
- `theme` — theme resolution helpers
- `mock-data` — mock data generator
- `query` — data query DSL
- `model-adapter` — pluggable model provider
- `prompt-registry` — prompt templates

## Media

- `video` — video primitives
- `audio` — audio primitives
- `recording` — recording primitives
- `recording-extensions` — extension points

## Contracts / protocol

- `protocol` — wire protocol primitives
- `agent-schema` — MCP tool schemas
- `decimal128` — Decimal128 for financial calculations
- `signed-link-token` — signed share-link tokens
- `session-code` — 6-char session codes
- `deep-link` — deep-link encoding
- `text-normalize` — Unicode normalization
- `object-store` — S3 client wrapper

## Platform / cross-cutting

- `common` — shared utilities
- `i18n` — locale + RTL helpers
- `web-security` — CSP + cookie hardening
- `audit-ts` — append-only audit outbox
- `observability` — OTel + Prometheus + structured logging
- `redact-pii` — PII redaction at ingest
- `api-client` — generated API client
- `sdk-ts` — public TypeScript SDK
- `analytics-sdk` — event-tracking SDK

## Naming convention

All packages are namespaced as `@domio/<name>` and declared in each
service's `package.json` as `"@domio/<name>": "workspace:*"`. The full
graph is resolved by `pnpm` via `pnpm-workspace.yaml`.