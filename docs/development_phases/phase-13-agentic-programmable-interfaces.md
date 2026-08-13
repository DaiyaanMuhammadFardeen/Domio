# Phase 13 — Agentic & Programmable Interfaces (MCP, deck-as-code, CLI)

**Phase:** 13
**Name:** Agentic & programmable interfaces (MCP, deck-as-code, CLI)
**Owner(s):** Stream D tech lead (agents/platform); shared UX writer with Stream D designer; Go platform team owns the CLI binary
**Critical path:** No (deepening phase, parallelizable)
**Parallel stream:** **Stream D — AI & agents**
**Intent:** Expose the Domio deck engine as **infrastructure other agents and power users drive natively**, not as an app with an API bolted on. This phase delivers a first-class MCP server with a granular tool surface (#221, #222), a structured deck schema as the canonical contract in both JSON and Protobuf (#223), a deck-as-code YAML representation with two-way sync (#224), agent-scoped permissions (#225), semantic element addressing (#226), a hash-chained tool-call audit trail (#227), dry-run / preview mode with atomic application (#228), webhooks that invoke agent workflows on data updates (#229), inspectable agent-to-agent handoff pipelines (#230), a `deckctl` CLI binary (#231), an embeddable local-first engine SDK (#232), typed JSON Schema component props for function calling (#233), an NL patch endpoint with prompt-injection defense (#234), an agent-readable deck comprehension endpoint (#235), and capability discovery (#236). It also delivers the four extension items from `/docs/feature-list.md` — agent linting (#237), confidence/uncertainty surfacing (#238), simulation mode (#239), and the deck diffing API (#240).

---

## 1. Goals

- **G1.** Ship a production-grade MCP server reachable over stdio (local sandbox) and streaming-HTTP transports, with full SSE notification support, passing the official MCP conformance suite. (Feature #221.)
- **G2.** Land the granular MCP tool surface — at least one tool per loosely-coupled editor subsystem — plus capability discovery (`list_tools` / `describe_schema` / `resources/list` / `prompts/list`) sufficient for an agent to learn Domio's editing surface in a single round-trip. (Features #222, #236.)
- **G3.** Promote the structured deck schema (JSON Schema + Protobuf) to be the **canonical contract** for the canvas, MCP, and deck-as-code; round-trip byte-stability holds for non-edited decks. (Feature #223.)
- **G4.** Ship deck-as-code (#224) — a YAML representation with two-way sync to the canvas, CRDT-backed, git-friendly — and the `deckctl` CLI (#231) that consumes it in CI.
- **G5.** Land the agent governance substrate: scoped permissions (#225), semantic element addressing with persistent renames log (#226), hash-chained tool-call audit trail (#227), dry-run patches (#228), and webhook-to-agent triggers (#229).
- **G6.** Land the advanced agent surfaces — agent-to-agent handoff pipelines (#230), local-first SDK (#232), JSON Schema component props (#233), NL patch endpoint (#234), comprehension endpoint (#235), agent linting (#237), uncertainty surfacing (#238), simulation mode (#239), deck diffing (#240) — so an external agent or power user can drive the platform end-to-end without using the visual canvas.

---

## 2. Scope

### 2.1 In scope (features)

| Feature | Title                                           | Notes                                                             |
| ------: | ----------------------------------------------- | ----------------------------------------------------------------- |
|    #221 | MCP server (first-class)                        | stdio + streaming-HTTP, SSE, capability negotiation               |
|    #222 | Full MCP tool surface                           | Granular, one tool per subsystem; idempotent                      |
|    #223 | Structured deck schema (JSON / YAML / Protobuf) | Canonical contract; round-trip stable                             |
|    #224 | Deck-as-code mode                               | YAML, two-way sync with canvas, git-friendly                      |
|    #225 | Agent-scoped permissions                        | Deny-by-default, composable scopes, per-deck                      |
|    #226 | Semantic element addressing                     | Stable across reorders, renames log                               |
|    #227 | Tool-call transcript / agent audit trail        | Hash-chained, agent-vs-human distinguished                        |
|    #228 | Dry-run / preview mode                          | Atomic patches with TTL                                           |
|    #229 | Webhooks → agent triggers                       | Signed payloads, idempotent dispatch                              |
|    #230 | Agent-to-agent handoff pipeline                 | First-class `agent_pipeline_run` object                           |
|    #231 | `deckctl` CLI                                   | Go binary; JSON by default; stable exit codes                     |
|    #232 | Local-first / offline SDK                       | Embeddable, deterministic renderer                                |
|    #233 | Function-calling-ready component props          | JSON Schema 2020-12 per component                                 |
|    #234 | NL patch API                                    | Dry-run by default; prompt-injection defended                     |
|    #235 | Agent-readable deck comprehension endpoint      | Structured, multi-depth, PII-redacted                             |
|    #236 | Capability discovery                            | `tools/list`, `resources/list`, `prompts/list`, `describe_schema` |
|    #237 | Deck linting for agents                         | `lint_deck` MCP tool; rule-set versioned                          |
|    #238 | Confidence / uncertainty surfacing              | Per-claim `uncertainty_flag`                                      |
|    #239 | Simulation mode for scenario testing            | Deterministic sweeps, streaming                                   |
|    #240 | Deck diffing API for agents                     | Semantic-address diff; bulk-aware; reverse-applicable             |

### 2.2 Out of scope (explicit)

- **All end-user AI features (#108–#125).** The MCP surface in P13 calls into the orchestrator built in P12; it does not re-implement AI features.
- **Novel state timeline (#205), cross-deck knowledge graph (#219), AI meeting listener (#214).** These are P21.
- **Live voice translation for audiences (#153).** P16.
- **Auto-update shared slides from governance flows (#186), content-expiry automation (#187).** These are P18/P20.
- **Public REST API surface for partners beyond what MCP exposes.** The REST endpoints mounted for MCP (e.g., `POST /v1/decks/{id}/patch`) are the same surface humans/agents use; no separate partner API in P13.
- **Bidirectional MCP-to-CRM connectors (Salesforce/HubSpot).** Out of scope; P17/P18 owns the CRM sync layer.

---

## 3. Dependencies

### 3.1 Upstream (must be complete)

- **P00 — Repo, contracts, dev env.** Provides `/services`, `/packages`, `/contracts`, `/workers` monorepo conventions.
- **P01 — Observability, CI/CD, infra baseline.** Provides OTel SDK, secret manager, CI gates, MCP conformance test pipeline. The MCP server's auth/scopes ride on the secret manager from P01.
- **P02 — Deck schema & scene-graph foundation.** Provides the existing JSON Schema; P13 promotes it to a canonical contract and adds Protobuf.
- **P03 — Canvas editor MVP.** Provides the canvas editor that subscribes to schema changes emitted by MCP writes.
- **P04 — CRDT & presence.** Required so MCP edits and canvas edits merge without conflict; the deck-as-code two-way sync (#224) reuses the CRDT substrate.
- **P05 — Persistence, versioning, branches.** Provides `deck_version` storage; the audit trail (#227) and dry-run patch TTL (#228) build on version events.
- **P12 — AI copilot foundation.** **Critical**: P13 mounts its tools over the AI orchestrator built in P12. The `ai_run` table from P12 is the substrate for the `agent_audit_event` chain. Without P12, the agent surface has nothing to wrap.

### 3.2 Downstream (this phase unblocks)

- **P15 — Presenter experience.** The presenter view (P15, #126–#141) consumes the audit trail and pipeline runs started by an agent — e.g., "AI meeting listener (#214) flagged this slide" — surfaced in the presenter's private panel.
- **P18 — Collaboration & workflow.** MR-style deck merge requests (#183) and review workflows (#180) reuse the diff endpoint (#240), the lint endpoint (#237), and the dry-run patch substrate (#228).
- **P20 — Security & enterprise.** Agent-scoped permissions (#225) extend to enterprise SSO/SCIM (#193), DLP (#195), and audit retention (#196). Brand governance (#194) leverages the brand-lock-aware scope (`brand:lock_aware`).
- **P22 — Polish, scale, hardening, GA.** Determinism guarantees (#232) and conformance eval (#221) feed the GA readiness gate.

---

## 4. Workstreams

### 4.1 WS-D7 — Schema, SDK, and Round-Trip (features 223, 224, 232)

**Tasks (in order):**

1. **T-D7.1 — Promote deck schema to canonical.** Move `contracts/schema/deck.schema.json` ownership to a `/services/schema-service` (new) that owns versioning and migration. Bump `deck_schema_version` to a published 1.4.0; add a `migrate_deck_schema(target_version)` tool.
2. **T-D7.2 — Protobuf mirror.** Generate `contracts/proto/domio/v1/deck.proto` from the JSON Schema using a checked-in codegen step. Both representations are kept in sync via a CI job that fails when they drift.
3. **T-D7.3 — Deterministic renderer contract.** `services/renderer` exposes `render(deck, opts)` with the byte-identical determinism guarantee. The renderer version is part of `local_engine_state`.
4. **T-D7.4 — Local-first SDK.** `packages/engine-sdk` (TypeScript) and `cmd/deckctl-runtime` (Go) ship as a single embedded library + binary. The SDK declares `local_engine_state`; sync to the platform is optional.
5. **T-D7.5 — YAML codec.** `packages/deck-as-code` implements `YAML ⇄ schema` with deterministic key ordering. Round-trip `deck → YAML → deck` is byte-stable for non-edited decks; reorder/canonicalize is normalized.
6. **T-D7.6 — Two-way sync.** The canvas subscribes to schema changes via the existing CRDT substrate (P04). Conflict resolution is deterministic; resolved state is replayable.
7. **T-D7.7 — Fan-out / single-file modes.** Configurable layout: one YAML file per deck, or a directory tree with one file per slide. Default: directory tree for git-friendliness on large decks.
8. **T-D7.8 — Drift detection.** After every round-trip, the engine re-emits YAML and flags unjustified diffs (typically comments preserved; reorder of keys normalized).

**Files / packages touched**

- `/services/schema-service/` (new)
- `/services/renderer/` (new — extracted from P03 if not already split)
- `/packages/engine-sdk/` (new)
- `/packages/deck-as-code/` (new)
- `/contracts/proto/domio/v1/deck.proto` (new — generated)
- `/contracts/schema/deck.schema.json` (versioned to 1.4.0)
- `/cmd/deckctl-runtime/` (new)

**Contracts added / consumed**

- **Added:** `POST /v1/decks/{id}/schema/migrate`, `GET /v1/schemas/deck`, `GET /v1/schemas/deck.proto`.
- **Consumed:** `deck.schema.json` (P02), CRDT substrate (P04), `deck_version` (P05).

**Tests written**

- Round-trip `deck → JSON → deck` byte-identical on a 50-slide fixture.
- Round-trip `deck → YAML → deck` byte-identical on the same fixture (canonical key order).
- Schema upgrade: 1.3.x deck migrates to 1.4.0 without data loss.
- Determinism: same schema + same renderer settings ⇒ byte-identical PNG/PDF across Linux/macOS/Windows runners.
- Drift detector: only flags diffs that are not comments or canonical reorderings.

**Definition of Done (WS-D7)**

- [ ] `deck_schema_version: 1.4.0` published; migration from 1.3.x is a callable MCP tool.
- [ ] Protobuf and JSON Schema round-trip through each other without loss.
- [ ] Local-first SDK renders a deck in a sandboxed runner with no network access.
- [ ] `deck → YAML → deck` is byte-stable for non-edited decks.

---

### 4.2 WS-D8 — MCP Server, Tool Surface, and Capability Discovery (features 221, 222, 236)

**Tasks (in order):**

1. **T-D8.1 — MCP server skeleton.** `/services/mcp-server` (Go). Implements stdio + streaming-HTTP transports, capability negotiation on `initialize`, JSON-RPC 2.0 correlation.
2. **T-D8.2 — Protocol conformance.** Server conforms to the MCP specification version current at GA. Passes the official conformance test suite in CI. Tracks the latest 2025-06+ revisions.
3. **T-D8.3 — Tool catalogue.** Implement the initial 20 tools (per `/docs/agentic-interfaces.md` §1.2): `create_deck`, `add_slide`, `edit_element`, `batch_edit_elements`, `bind_data_source`, `unbind_data_source`, `apply_theme`, `get_deck_state`, `render_slide_to_image`, `list_components`, `insert_component`, `update_component_props`, `run_scenario`, `export_deck`, `summarize_deck`, `lint_deck`, `diff_decks`, `simulate`, `patch_deck`, `dry_run`.
4. **T-D8.4 — Idempotency.** Every mutating tool requires an idempotency key; same key + same args return cached result.
5. **T-D8.5 — Capability discovery.** `tools/list`, `resources/list` (URIs like `deck://{id}/structure`, `deck://{id}/audit`), `prompts/list`, `describe_schema`. Single round-trip exposes the entire surface.
6. **T-D8.6 — Resource subscription.** SSE notifications on resource updates (deck structure, audit feed).
7. **T-D8.7 — MCP conformance eval.** A nightly job runs the official MCP conformance test suite against the staging server; failures block release.
8. **T-D8.8 — Structured error envelope.** RFC-7807-style problem-detail JSON with Domio-specific extensions (`permission_denied`, `precondition_failed`, `read_only_mode`, `patch_stale`, `address_ambiguous`, `validation_failed`, etc.).

**Files / packages touched**

- `/services/mcp-server/` (new)
- `/contracts/openapi/v1/mcp.yaml` (new — capability descriptor, resources list)
- `/contracts/proto/domio/v1/mcp.proto` (new — internal gRPC)
- `/apps/developer-portal/src/mcp/` (new — capability browser; optional)
- `/workers/mcp-conformance/` (new — nightly eval runner)

**Contracts added / consumed**

- **Added:** MCP `initialize` / `tools/list` / `tools/call` / `resources/list` / `resources/read` / `resources/subscribe` / `prompts/list` / `describe_schema`. SSE channel `mcp://{id}/events`.
- **Consumed:** `deck.schema.json` (WS-D7), `component_prop_schema` (WS-D10), all P12 internal services.

**Tests written**

- Conformance suite green for every supported MCP feature.
- Each tool: idempotency under retry; `precondition_failed` on missing prerequisites; `validation_failed` on bad typed props with JSON Pointer location.
- Resource subscription: client reconnects after server restart, prior subscriptions re-established.
- Error envelope parses for every documented failure code.

**Definition of Done (WS-D8)**

- [ ] MCP server passes the official conformance test suite on every PR.
- [ ] All 20 initial tools reachable by name with documented JSON Schema I/O.
- [ ] `tools/list` returns the full surface in one round-trip; an agent can complete a non-trivial edit without consulting external docs.
- [ ] SSE notifications fire on deck changes; clients reconnect cleanly.

---

### 4.3 WS-D9 — Permissions, Audit, Dry-Run, Webhooks (features 225, 227, 228, 229)

**Tasks (in order):**

1. **T-D9.1 — Permission service.** `/services/permissions` issues short-lived `mcp_session` tokens (≤ 30 min idle, ≤ 24 h lifetime). Token carries `agent_identity`, `scopes`, `deny`, `expires_at`. Hashes only logged; never plaintext.
2. **T-D9.2 — Scope enforcement.** Scope check on every tool call, not just at the session boundary. Scopes (deny-by-default): `deck:read`, `deck:write`, `deck:{id}`, `data:bind`, `data:writeback`, `brand:lock_aware`, `theme:write`, `component:write`, `export:run`, `audit:read`, `lint:run`, `simulation:run`, `diff:run`.
3. **T-D9.3 — Brand-lock awareness.** Writes against brand-locked regions require `brand:lock_aware`; even then, only specific override roles pass.
4. **T-D9.4 — Audit trail service.** `/services/audit`. Append-only, hash-chained (`hash_prev → hash_this`), each event signed with the platform signing key. Captures: timestamp, session_id, agent_identity, tool, idempotency_key, args_hash, result_status, scopes, summary.
5. **T-D9.5 — Agent-vs-human distinction.** Version history UI shows "Agent: Claude via MCP — added slide 7" with a distinct icon/color.
6. **T-D9.6 — Dry-run engine.** `dry_run_patch` is a pure function of (current_schema, proposed_ops). Token + TTL (default 7 days). Atomic apply. Stale patches return `patch_stale` with a fresh diff.
7. **T-D9.7 — Patch comments + combinations.** Patches are comment-threaded (reusing F179) and combinable.
8. **T-D9.8 — Webhook dispatcher.** `/services/webhooks`. HMAC-SHA256 signature verification, idempotency, dead-letter queue, retry policy, observability. Rate-limited per source.
9. **T-D9.9 — `webhook_trigger` declarations.** Define source event → agent workflow mapping with optional input transform and review policy. `feedback_loop_allowed: false` enforced at dispatch.
10. **T-D9.10 — Reversal events.** Rolled-back tool calls emit a paired event linked by `reverses_event_id`.

**Files / packages touched**

- `/services/permissions/` (new)
- `/services/audit/` (new)
- `/services/webhooks/` (new)
- `/apps/editor/src/audit/` (new — version history agent-vs-human distinction)
- `/apps/editor/src/patches/` (new — pending-patch banner, comment threads)
- `/contracts/openapi/v1/audit.yaml` (new)
- `/contracts/openapi/v1/webhooks.yaml` (new)

**Contracts added / consumed**

- **Added:** `POST /v1/mcp/sessions`, `GET /v1/audit?actor=agent|human|all`, `POST /v1/webhooks`, `GET /v1/webhooks/{id}`, `POST /v1/decks/{id}/patches`, `POST /v1/decks/{id}/patches/{token}/apply`, `DELETE /v1/decks/{id}/patches/{token}`.
- **Consumed:** `mcp_session` lifecycle from WS-D8; `deck_version` (P05).

**Tests written**

- Deny-by-default: a session with no scopes returns `permission_denied` on any tool call.
- Scope composition: granting `deck:{id}` does not implicitly grant `deck:write` for other decks.
- Audit hash chain: tampering with one event breaks verification on subsequent events.
- Dry-run patch: applying a stale patch returns `patch_stale`; atomic apply holds.
- Webhook signature: tampered payload returns 401; replay within idempotency window returns cached result.
- Reversal: rolling back a tool call emits both original and reversal events, linked.

**Definition of Done (WS-D9)**

- [ ] All scopes enforced at the tool-call boundary, verified by tests.
- [ ] Audit trail is append-only and hash-chained; tampering is detectable.
- [ ] Dry-run patches apply atomically and refuse stale ones.
- [ ] Webhook dispatcher handles 1K events/min without dropping signatures; dead-letter after retry budget.

---

### 4.4 WS-D10 — Semantic Addressing, Component Props, Comprehension (features 226, 233, 235)

**Tasks (in order):**

1. **T-D10.1 — Semantic address registry.** `services/schema-service/semantic_addresses`. Format: `slide[{n|semantic_name}].{element_type}[{semantic_id}](.field)?`. Persistent mapping with a renames log.
2. **T-D10.2 — O(1) address resolution.** Address → element pointer is O(1) for typical decks; ambiguous addresses return `address_ambiguous` with candidate list (never silent pick).
3. **T-D10.3 — Deletion grace period.** Deleted elements keep the address slot reserved for 7 days (configurable). Late edits return `element_pending_creation` instead of silent no-op.
4. **T-D10.4 — Disambiguators.** Parallel-scenario addresses take a `[scenario=bull]` qualifier.
5. **T-D10.5 — Component prop JSON Schema registry.** `/services/component-registry` publishes a JSON Schema draft 2020-12 per smart component (#25). Runtime validates every prop update.
6. **T-D10.6 — Schema evolution.** Component schema updates are versioned; old agent calls continue to work until the deprecation window expires.
7. **T-D10.7 — Comprehension service.** `services/comprehension` extracts `comprehension_summary` with `depth` parameter (titles / outlines / full). PII redaction at this layer.
8. **T-D10.8 — Comprehension contents.** Per-slide: intent, content blocks, data bindings (with lineage), components used, animations/timelines. Streaming for long decks.

**Files / packages touched**

- `/services/schema-service/semantic_addresses/` (new)
- `/services/component-registry/` (new)
- `/services/comprehension/` (new)
- `/contracts/schema/components/` (new — per-component JSON Schema files)
- `/contracts/openapi/v1/components.yaml` (new)
- `/contracts/openapi/v1/comprehension.yaml` (new)

**Contracts added / consumed**

- **Added:** `GET /v1/decks/{id}/semantic-addresses`, `POST /v1/components/{id}/props`, `GET /v1/components/{id}/props.schema`, `GET /v1/decks/{id}/summary?depth=titles|outlines|full&page=1`.
- **Consumed:** `deck.schema.json` (WS-D7), `component` (P06), `data_binding` (P08).

**Tests written**

- Address resolution: 100 reorderings of a 100-slide deck, 100% of original addresses still resolve.
- Ambiguity: two elements sharing a semantic id return `address_ambiguous` with both candidates.
- Deletion grace period: late edit within 7 days returns `element_pending_creation`; after 7 days returns `address_unknown`.
- Component prop validation: bad typed props return `validation_failed` with JSON Pointer location.
- Comprehension: redacted summaries do not contain names, emails, phones, or addresses (regression fixture).
- Comprehension streaming: long decks stream with page tokens; reassembled output equals non-streamed output.

**Definition of Done (WS-D10)**

- [ ] All addresses survive 100 reorderings.
- [ ] Every published component has a JSON Schema 2020-12 document.
- [ ] Comprehension endpoint meets p95 ≤ 800ms for a 50-slide deck.

---

### 4.5 WS-D11 — CLI, Local SDK, NL Patch, Pipelines (features 230, 231, 232, 234)

**Tasks (in order):**

1. **T-D11.1 — `deckctl` CLI skeleton.** `/cmd/deckctl` (Go). Subcommands: `create`, `push`, `pull`, `diff`, `lint`, `apply`, `simulate`, `summarize`, `render`, `export`, `whoami`, `login`, `audit`.
2. **T-D11.2 — Stable exit codes.** 0 success; 1 generic; 2 validation; 3 permission; 4 not found; 5 conflict; 6 patch stale. Documented and tested.
3. **T-D11.3 — Output formats.** JSON by default; `--human` for human-readable. Stdin / `-` / `--batch-file` for inputs.
4. **T-D11.4 — Shell completion.** Generated for bash, zsh, fish.
5. **T-D11.5 — CLI signing.** `deckctl` releases signed; install verifies signatures.
6. **T-D11.6 — Local SDK embed.** `packages/engine-sdk` exposes a `Engine` class with `render(deck, opts)` and `Schema.loadYAML(path)`. Determinism guarantee holds.
7. **T-D11.7 — NL patch service.** `services/nl-patch`. Wraps the granular tools; returns a `dry_run_patch` plus the chain. Always dry-run by default; caller opts in to apply.
8. **T-D11.8 — NL patch prompt-injection defense.** Instruction treated as untrusted user input; system prompt fixed and isolated; tool calls restricted to the scope and validated against schema; rate-limited and length-limited.
9. **T-D11.9 — Ambiguity surfacing.** NL patch returns `instruction_ambiguous` with candidate interpretations when ambiguous; never silently picks.
10. **T-D11.10 — Agent pipeline service.** `services/pipelines`. `agent_pipeline_run` is a first-class object; per-step intents vs. observed outcomes are recorded. DAG rendering in `/apps/editor/src/agents/PipelineInspector.tsx`.
11. **T-D11.11 — Pipeline replay.** Pipelines are replayable (re-running with same inputs yields same outputs modulo LLM non-determinism, which is surfaced explicitly).

**Files / packages touched**

- `/cmd/deckctl/` (new)
- `/packages/engine-sdk/` (WS-D7 cross-link)
- `/services/nl-patch/` (new)
- `/services/pipelines/` (new)
- `/apps/editor/src/agents/PipelineInspector.tsx` (new)
- `/contracts/openapi/v1/pipelines.yaml` (new)

**Contracts added / consumed**

- **Added:** CLI surface; `POST /v1/decks/{id}/patch` (NL patch); `POST /v1/pipelines`, `GET /v1/pipelines/{id}`; SSE `agent_pipeline_run/{id}` events.
- **Consumed:** `mcp_session` (WS-D9), `dry_run_patch` (WS-D9), `deck.schema.json` (WS-D7).

**Tests written**

- CLI exit code matrix: each code exercised and asserted.
- CLI streaming: large decks don't load the entire schema into memory.
- NL patch prompt-injection: attempts to override the system prompt fail with a logged refusal.
- NL patch ambiguity: ambiguous instruction returns `instruction_ambiguous` with ≥ 2 candidates.
- Pipeline replay: same inputs ⇒ same outputs (modulo declared non-determinism).

**Definition of Done (WS-D11)**

- [ ] `deckctl --help` exits in ≤ 50ms; subcommands in ≤ 200ms for a 50-slide deck (excluding network).
- [ ] NL patch is dry-run by default; apply requires an explicit opt-in.
- [ ] Pipelines are inspectable as a DAG with replay.

---

### 4.6 WS-D12 — Lint, Uncertainty, Simulation, Diff (features 237, 238, 239, 240)

**Tasks (in order):**

1. **T-D12.1 — Lint engine.** `services/linter`. Rule-set versioned. Covers broken data bindings, orphaned components, off-brand colors, accessibility (contrast, alt-text, reading order), schema validation, deprecated components. Custom rules supported; suppressions recorded.
2. **T-D12.2 — `lint_deck` MCP tool.** Returns `agent_lint_result` with `severity`, `address`, `rule_id`, `suggested_fix`. Run budget ≤ 2s for a 50-slide deck; resumable.
3. **T-D12.3 — Uncertainty surfacer.** Tags each claim in a generated narrative with `uncertainty_flag { confidence, basis, data_source, verified_by, verified_at }`. Lint can flag low-confidence claims.
4. **T-D12.4 — Stale-data confidence degradation.** Claims backed by stale data sources automatically lose confidence (integrates with P12 freshness).
5. **T-D12.5 — Human override.** A human can mark a claim as verified, which updates the audit trail.
6. **T-D12.6 — Simulation runner.** `services/simulation`. Sweep one or more input parameters with ranges; deterministic; streamed CSV/JSON via SSE. Combinatorial bounds enforced (`simulation_too_large` with suggested reduction).
7. **T-D12.7 — Caching.** Identical sweeps return cached results.
8. **T-D12.8 — Deck diff service.** `services/diff-deck`. Semantic-address diff between two `deck_version`s. Bulk reorders reported as bulk, not as N individual moves. Schema migrations reported with a migration identifier.
9. **T-D12.9 — Reverse-applicable diffs.** A diff can be applied to roll back changes (subject to dry-run semantics).

**Files / packages touched**

- `/services/linter/` (new)
- `/services/uncertainty/` (new — or fold into `services/comprehension`)
- `/services/simulation/` (new)
- `/services/diff-deck/` (new)
- `/apps/editor/src/lint/` (new — UI for reviewing lint results)
- `/contracts/openapi/v1/lint.yaml` (new)
- `/contracts/openapi/v1/simulation.yaml` (new)
- `/contracts/openapi/v1/diff.yaml` (new)

**Contracts added / consumed**

- **Added:** `POST /v1/decks/{id}/lint`, `GET /v1/decks/{id}/uncertainty?min_confidence=...`, `POST /v1/decks/{id}/simulate`, `POST /v1/decks/{id}/diff`.
- **Consumed:** `deck_version` (P05), `data_source` (P08), `freshness_record` (P12), `brand_kit` (P07), `theme` (P07).

**Tests written**

- Lint: each rule fires on its known fixture.
- Lint run budget: 50-slide deck in ≤ 2s on reference hardware.
- Lint custom rules: an org-defined rule produces a result with the rule source.
- Lint suppressions: a suppressed rule does not appear in the result; suppression itself is visible.
- Uncertainty: stale data lowers confidence automatically.
- Simulation determinism: same inputs + engine version ⇒ byte-identical CSV.
- Simulation bounds: sweep exceeding the bound returns `simulation_too_large` with a suggested reduction.
- Diff: deck → diff → apply is identity for non-modified decks.
- Diff bulk move: 50-slide reorder reported as a single bulk move with a manifest.

**Definition of Done (WS-D12)**

- [ ] `lint_deck` MCP tool meets ≤ 2s p95 for a 50-slide deck.
- [ ] Uncertainty surfacer integrates with P12 freshness; stale claims automatically degraded.
- [ ] `simulate` returns deterministic, streamed results.
- [ ] `diff_decks` is by semantic address; bulk moves reported as bulk; reverse-applicable.

---

## 5. Architecture & Data

### 5.1 New tables (PostgreSQL)

All tables inherit `created_at`, `updated_at`, `created_by`, `updated_by`, `ai_run_id`, `agent_session_id`. Full JSON examples are in `/docs/agentic-interfaces.md` §5.

| Table                       | Purpose                                         | Migrations file                          |
| --------------------------- | ----------------------------------------------- | ---------------------------------------- |
| `mcp_session`               | Short-lived agent session with scopes           | `migrations/2026_08_mcp_session.sql`     |
| `mcp_tool_call`             | One tool invocation, idempotency-keyed          | `migrations/2026_08_mcp_tool_call.sql`   |
| `agent_audit_event`         | Hash-chained, append-only audit; agent-vs-human | `migrations/2026_08_agent_audit.sql`     |
| `dry_run_patch`             | Pending atomic patch with TTL                   | `migrations/2026_08_dry_run_patch.sql`   |
| `webhook_trigger`           | Source-event → agent-workflow mapping           | `migrations/2026_08_webhook_trigger.sql` |
| `agent_pipeline_run`        | DAG of handoffs with replayable steps           | `migrations/2026_08_agent_pipeline.sql`  |
| `cli_invocation`            | CLI call record for audit + telemetry           | `migrations/2026_08_cli_invocation.sql`  |
| `semantic_address_registry` | Persistent id ↔ element mapping                | `migrations/2026_08_semantic_addr.sql`   |
| `component_prop_schema`     | Versioned JSON Schema per component             | `migrations/2026_08_component_prop.sql`  |
| `agent_lint_result`         | Lint runs with rule-set version + result hash   | `migrations/2026_08_agent_lint.sql`      |
| `simulation_run`            | Deterministic parameter-sweep records           | `migrations/2026_08_simulation.sql`      |
| `deck_diff`                 | Cached diffs by version pair                    | `migrations/2026_08_deck_diff.sql`       |
| `local_engine_state`        | Per-SDK engine identity for sync                | `migrations/2026_08_local_engine.sql`    |
| `uncertainty_flag`          | Per-claim confidence + basis                    | `migrations/2026_08_uncertainty.sql`     |
| `nl_patch_request`          | NL patch audit with chain and verdict           | `migrations/2026_08_nl_patch.sql`        |

### 5.2 New services

- `/services/mcp-server` — Go, hosts the MCP protocol over stdio + streaming-HTTP.
- `/services/schema-service` — Go, owns `deck_schema_version`, JSON Schema validation, Protobuf mirroring, semantic-address registry.
- `/services/renderer` — Go, deterministic byte-identical renderer (extracted from P03 if not already split).
- `/services/permissions` — Go, issues short-lived `mcp_session` tokens; enforces scopes.
- `/services/audit` — Go, append-only hash-chained audit log.
- `/services/webhooks` — Go, signed dispatcher with idempotency, retry, dead-letter.
- `/services/comprehension` — Go, extracts `comprehension_summary`.
- `/services/component-registry` — Go, publishes per-component JSON Schemas.
- `/services/linter` — Go, rule-set versioned linter.
- `/services/uncertainty` — Go, per-claim confidence surfacer.
- `/services/simulation` — Go, deterministic parameter-sweep runner.
- `/services/diff-deck` — Go, semantic-address diff service.
- `/services/nl-patch` — Go, NL patch wrapper.
- `/services/pipelines` — Go, agent pipeline DAG runner.

### 5.3 New packages / binaries

- `/packages/engine-sdk` — TS, embeddable local engine.
- `/packages/deck-as-code` — TS, YAML codec.
- `/cmd/deckctl` — Go, the `deckctl` CLI binary.

### 5.4 New contracts

- `/contracts/schema/deck.schema.json` — bumped to v1.4.0, canonical.
- `/contracts/proto/domio/v1/deck.proto` — generated mirror.
- `/contracts/openapi/v1/mcp.yaml` — MCP capability descriptor.
- `/contracts/openapi/v1/audit.yaml`, `/v1/webhooks.yaml`, `/v1/components.yaml`, `/v1/comprehension.yaml`, `/v1/lint.yaml`, `/v1/simulation.yaml`, `/v1/diff.yaml`, `/v1/pipelines.yaml`.
- MCP tool spec documents under `/contracts/mcp/tools/*.json`.

### 5.5 Master-doc references

- **System architecture:** `/docs/04-system-architecture.md` — agentic layer is a new vertical in the modular monolith.
- **Data & DB design:** `/docs/05-data-database-design.md` — Postgres remains the system of record; audit log is its own append-mostly table.
- **Tech stack:** `/docs/06-technology-stack.md` — Go everywhere on the server (MCP, services, CLI), TypeScript for SDK, JSON Schema 2020-12 for component props, Protobuf for internal gRPC, HMAC-SHA256 for webhook signing.
- **Security:** `/docs/07-security-planning.md` — vault for tokens and secrets; hash-chained audit; mTLS between services; PII redaction at the response boundary; CLI artifact signing.
- **Agentic interfaces:** `/docs/agentic-interfaces.md` — the canonical reference for every feature in P13.

---

## 6. Verification

| Feature | Test                                                                                   | Expected result                                                                | Owner  |
| ------: | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------ |
|    #221 | Run MCP conformance suite in CI                                                        | 100% pass                                                                      | WS-D8  |
|    #221 | Initialize over stdio and streaming-HTTP                                               | Capabilities returned; resources subscribed                                    | WS-D8  |
|    #221 | Resume after server restart                                                            | Prior subscriptions re-established; in-flight calls return `request_cancelled` | WS-D8  |
|    #222 | Call `tools/list` and `tools/call edit_element` on a deck                              | All 20 initial tools reachable; idempotency under retry                        | WS-D8  |
|    #223 | Round-trip `deck → JSON → deck` on a 50-slide fixture                                  | Byte-identical                                                                 | WS-D7  |
|    #223 | Round-trip `deck → YAML → deck` on the same fixture                                    | Byte-identical                                                                 | WS-D7  |
|    #223 | `migrate_deck_schema(target=1.4.0)` on a 1.3.x deck                                    | Migration runs without loss; dry-run-capable                                   | WS-D7  |
|    #224 | Edit a deck in canvas and `deckctl pull`                                               | Pulled YAML reflects the canvas change                                         | WS-D7  |
|    #224 | Edit the YAML and `deckctl push`; canvas is open                                       | Canvas subscribes to schema change and updates                                 | WS-D7  |
|    #224 | Concurrent canvas + YAML edit                                                          | CRDT resolves deterministically; resolved state replayable                     | WS-D7  |
|    #225 | Session with no scopes                                                                 | All mutating tools return `permission_denied`                                  | WS-D9  |
|    #225 | Session with `deck:{id1}:read` writing to `{id2}`                                      | `permission_denied`; audit records denial                                      | WS-D9  |
|    #225 | Brand-locked write without `brand:lock_aware`                                          | `permission_denied`                                                            | WS-D9  |
|    #226 | 100 reorderings of a 100-slide deck                                                    | 100% of original semantic addresses still resolve                              | WS-D10 |
|    #226 | Two elements share a semantic id                                                       | `address_ambiguous` with both candidates                                       | WS-D10 |
|    #226 | Late edit within 7 days of deletion                                                    | `element_pending_creation`                                                     | WS-D10 |
|    #227 | Audit hash chain                                                                       | Tampering with one event breaks verification on subsequent events              | WS-D9  |
|    #227 | Version history shows agent edits distinctly                                           | Different icon/color; agent identity in summary                                | WS-D9  |
|    #228 | Apply a stale `dry_run_patch`                                                          | `patch_stale` with fresh diff                                                  | WS-D9  |
|    #228 | Atomic apply of a multi-op patch                                                       | Either all ops applied or none                                                 | WS-D9  |
|    #229 | Webhook replay within idempotency window                                               | Cached result returned                                                         | WS-D9  |
|    #229 | Workflow with `feedback_loop_allowed: false` mutating the source                       | Dispatcher refuses to invoke                                                   | WS-D9  |
|    #230 | Run a 3-step pipeline (research → deck-builder → compliance)                           | DAG inspector shows all 3 steps with inputs/outputs/intent                     | WS-D11 |
|    #230 | Replay the pipeline                                                                    | Same outputs (modulo declared non-determinism)                                 | WS-D11 |
|    #231 | `deckctl --help` exits in ≤ 50ms                                                       | Pass                                                                           | WS-D11 |
|    #231 | Stable exit codes exercised (0, 1, 2, 3, 4, 5, 6)                                      | Each code returns as expected                                                  | WS-D11 |
|    #231 | `deckctl lint deck.yaml --format json` on a deck with 5 seeded issues                  | JSON output with each issue, address, severity                                 | WS-D11 |
|    #232 | Embed SDK in a sandboxed runner with no network                                        | Renders a deck deterministically                                               | WS-D7  |
|    #232 | Same schema + same engine version ⇒ byte-identical PNG/PDF across Linux/macOS/Windows  | Pass                                                                           | WS-D7  |
|    #233 | Update a component prop with a bad type                                                | `validation_failed` with JSON Pointer location                                 | WS-D10 |
|    #234 | `POST /v1/decks/{id}/patch` with an instruction                                        | Returns a `dry_run_patch` + chain; does not apply by default                   | WS-D11 |
|    #234 | NL patch prompt-injection attempt                                                      | Refused; logged                                                                | WS-D11 |
|    #234 | Ambiguous instruction                                                                  | `instruction_ambiguous` with ≥ 2 candidate interpretations                     | WS-D11 |
|    #235 | `GET /v1/decks/{id}/summary?depth=full`                                                | Per-slide intent, content blocks, bindings, components, animations             | WS-D10 |
|    #235 | Comprehension of a deck containing PII                                                 | PII redacted; redaction recorded in audit                                      | WS-D10 |
|    #236 | `tools/list` + `resources/list` + `prompts/list` + `describe_schema` in one round-trip | Full surface returned; no external docs required                               | WS-D8  |
|    #237 | `lint_deck` on a deck with 50 seeded issues                                            | All issues reported; run ≤ 2s for a 50-slide deck                              | WS-D12 |
|    #237 | Lint with a custom org rule                                                            | Result includes the rule source                                                | WS-D12 |
|    #238 | Narrative claim backed by stale data                                                   | Confidence auto-degraded; flag visible                                         | WS-D12 |
|    #238 | Human marks a claim as verified                                                        | Audit updated; lint no longer flags                                            | WS-D12 |
|    #239 | `simulate` with a 1-parameter 50-sample sweep                                          | Deterministic streamed CSV; ≥ 1,000 samples/s on reference hardware            | WS-D12 |
|    #239 | Sweep exceeding bound                                                                  | `simulation_too_large` with suggested reduction                                | WS-D12 |
|    #240 | `diff_decks` between two versions                                                      | Semantic-address diff; bulk reorder reported as bulk                           | WS-D12 |
|    #240 | `diff → apply` round-trip                                                              | Identity for non-modified decks                                                | WS-D12 |

---

## 7. Risks & Open Decisions

| Risk                                           | Mitigation                                                                                                                                                                        |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MCP spec evolution between phases              | Conformance suite pinned to a known-good revision; CI re-runs the suite on each spec update; a "spec freeze" tag is required before cutting a release                             |
| Drift between JSON Schema and Protobuf         | CI codegen step that fails when the two representations diverge; both are checked in to a single source-of-truth file                                                             |
| Audit chain tampering                          | Constant-time verification; signing key in vault; tamper-evident logging; verification is a CI gate on every release                                                              |
| Scope explosion (too many fine-grained scopes) | Start with the documented minimum scope set; allow extensions but require a documented rationale; scopes appear in capability discovery so agents can self-evaluate               |
| NL patch prompt injection                      | System prompt isolated and fixed; instruction rate-limited + length-limited; tool calls restricted to scope and validated against schema; refusal logged                          |
| Determinism regressions in the local SDK       | Cross-platform determinism tests in CI on Linux/macOS/Windows; any divergence blocks the release; `local_engine_state` is part of the cache key                                   |
| Brand-lock bypass via agent scope              | Even with `brand:lock_aware`, only specific override roles can pass; brand-locked regions are visible in the schema so comprehension can flag violations                          |
| Webhook replay storms                          | Per-source rate limiting; throttled events coalesce into a single "since-X" trigger; dead-letter budget configurable per workspace                                                |
| Diff churn on bulk reorders                    | Bulk-move semantics in the diff service; non-bulk reorders still reported individually; the diff is reverse-applicable for rollback                                               |
| CLI artifact supply-chain                      | Signed releases; install verifies signatures; SHA-256 pinned in CI consumers                                                                                                      |
| Bangladesh PDPA for agent audit retention      | Default 90-day retention; configurable per enterprise; PII redaction at log time; audit hashes are recorded but plaintext payloads are not retained beyond the workspace's policy |

**Open decisions to close before P13 starts:**

- O-D7. Schema-stability policy for `deck_schema_version`. **Recommendation:** `1.x.y` for backwards-compatible changes; `2.x` for breaking changes.
- O-D8. Pipeline inspector visibility. **Recommendation:** admin-only by default; opt-in for the deck owner.
- O-D9. Schema includes brand-lock state. **Recommendation:** yes, so comprehension can flag brand-lock violations.
- O-D10. Agent audit-event retention default. **Recommendation:** 90 days for free tier; configurable per enterprise.
- O-D11. NL patch endpoint in self-hosted SDK mode. **Recommendation:** enabled with a per-deployment allowlist.

---

## 8. Demo

**Goal.** Prove P13 is shippable in an internal environment, end-to-end, with an external agent driving the platform.

**Setup.**

- Internal staging with a workspace `Acme HQ`, 3 seeded decks (Q3 Board, Pricing 2026, LaunchPlan), 1 brand kit (`Acme Bold`), 1 Google Sheet data source.
- MCP server live on streaming-HTTP; `deckctl` CLI installed on the demo laptop.
- Two MCP clients running: an in-house agent (`DeckBot`) and a third-party MCP-compatible client (`ExternalBot`).
- Vault populated; webhook secret registered; one `webhook_trigger` configured for `row_changed` → `weekly_refresh`.

**Script (≈ 25 minutes).**

1. **Schema round-trip (#223, #224).** Open `Q3 Board` in the canvas. Run `deckctl pull deck://Q3Board --format yaml > /tmp/q3.yaml`. Show the file. Edit a slide title in the canvas. Run `deckctl pull` again; show the diff. Run `deckctl push /tmp/q3.yaml --idempotency-key demo-1`; canvas subscribes and updates.
2. **MCP capability discovery (#221, #236).** Start `DeckBot` in a fresh shell. It issues `initialize` (stdio). Show the returned capabilities, `tools/list`, `resources/list`. Have the agent complete a non-trivial edit (`add_slide`, `edit_element`, `bind_data_source`) without consulting external docs.
3. **Tool surface granularity (#222).** Have `DeckBot` make 3 surgical edits via `edit_element` rather than regenerating. Show the audit log entries: `Agent: DeckBot via MCP — edited chart churn_by_region on slide churn`.
4. **Permissions (#225).** Issue `DeckBot` a token with `deck:Q3Board:read` only. Have it attempt `edit_element`; show `permission_denied`. Issue a token with `deck:Q3Board:write` but no `brand:lock_aware`; attempt to edit a brand-locked slide; show refusal. Grant `brand:lock_aware`; edit succeeds.
5. **Audit trail (#227).** Open the version history in the UI. Show agent entries in a distinct color/icon. Tamper with one row in the database (simulated) and re-run the chain verifier; show the break.
6. **Dry-run + NL patch (#228, #234).** Have `ExternalBot` run `POST /v1/decks/LaunchPlan/patch` with `"make slide 5's chart a waterfall and shorten the headline"`. Show the returned `dry_run_patch` + chain. Click `Apply` in the UI banner; show the atomic application and the diff.
7. **Webhook → agent workflow (#229).** Update a row in the connected Google Sheet. Show the webhook dispatcher receiving the event; `DeckBot`'s `weekly_refresh` workflow runs; a `dry_run_patch` is produced and surfaces in the UI for human review.
8. **Pipeline (#230).** Run a 3-step pipeline (research → deck-builder → compliance). Open the inspector; show the DAG with inputs/outputs per step. Replay step 2 with the same inputs; show the declared non-determinism.
9. **CLI in CI (#231).** In a CI runner shell, run `deckctl --help` (≤ 50ms), `deckctl lint deck.yaml --format json` (issues reported), `deckctl diff deck.yaml --against $PRIOR_SHA --format unified`. Show the exit codes.
10. **Comprehension + lint + uncertainty + diff (#235, #237, #238, #240).** From the CLI: `deckctl summarize deck://Q3Board --depth full` (PII redacted). `deckctl lint deck://Q3Board --format json` (issues with semantic addresses). `deckctl diff deck://Q3Board --against $PRIOR_VERSION --format json` (semantic-address diff; bulk reorders reported as bulk). Open the deck; show that a claim backed by a stale citation carries a low-confidence badge.
11. **Simulation (#239).** From the CLI: `deckctl simulate deck://PricingModel --param discount=range:0..0.5:50 --output csv`. Streamed CSV output; replay the sweep — show byte-identical output.
12. **Local SDK (#232).** In an offline sandbox (no network), load the YAML and render a PNG with the embedded SDK. Show the byte-identical output against the same deck rendered server-side.

**Done criteria for the demo.**

- Every step above completes without manual intervention outside the documented UX/CLI.
- The audit log contains at least one row per feature exercised; chain verification passes at the end.
- Determinism is proven: the same schema + same engine version produces byte-identical output across Linux/macOS/Windows (one screenshot each).
- The MCP conformance suite passes live in CI at the moment the demo starts.

---

## 9. Definition of Done

- [ ] All features #221–#240 ship behind per-workspace feature flags where appropriate (NL patch, simulation, agent pipelines).
- [ ] Contracts versioned: `/contracts/openapi/v1/*.yaml`, `/contracts/proto/domio/v1/*.proto`, `/contracts/schema/deck.schema.json` (v1.4.0). Backward-compatible changes only in `1.x`; breaking changes require `2.x`.
- [ ] MCP server passes the official conformance test suite in CI on every PR; release blocked on regression.
- [ ] All P13 unit, integration, and E2E tests pass in CI (target: ≥ 85% line coverage in `services/mcp-server`, ≥ 90% in `services/permissions` and `services/audit`).
- [ ] Round-trip `deck → JSON → deck` and `deck → YAML → deck` are byte-stable on the canonical fixture.
- [ ] Determinism CI: same schema + same engine version ⇒ byte-identical PNG/PDF across Linux, macOS, Windows.
- [ ] Audit hash chain verification is a release gate.
- [ ] All scopes documented in capability discovery; a regression test verifies deny-by-default.
- [ ] `deckctl --help` ≤ 50ms; subcommands ≤ 200ms for a 50-slide deck.
- [ ] NL patch is dry-run by default; prompt-injection eval suite is green.
- [ ] `lint_deck` ≤ 2s p95 for a 50-slide deck.
- [ ] `simulate` returns deterministic, streamed results.
- [ ] `diff_decks` is by semantic address; bulk moves reported as bulk; reverse-applicable.
- [ ] OpenTelemetry traces flow from MCP request → tool execution → schema write for every feature exercised in the demo.
- [ ] Structured logs include `trace_id`, `session_id`, `agent_id`, `scopes`, `tool`, `idempotency_key`, `result_status`; PII redacted at log time.
- [ ] CLI releases signed; install verifies signatures.
- [ ] Threat-model review completed; top risks from `/docs/agentic-interfaces.md` §7 either mitigated or explicitly accepted.
- [ ] `/docs/agentic-interfaces.md` updated where P13 implementation diverges from the spec.
- [ ] Internal demo passed end-to-end per §8.

---

**End of Phase 13.**
