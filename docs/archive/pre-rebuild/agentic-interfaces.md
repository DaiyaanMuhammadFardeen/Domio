# Section 16 — Agentic & Programmable Interfaces

**Scope:** Features 221–236 of the Domio product specification (the "AI builds on this" layer) plus the four extension items 237–240 (deck linting for agents, confidence/uncertainty surfacing, simulation mode, deck diffing API). This section finalizes the principle from §1 of the planning guide — _every architectural decision should trace back to the problem statement_ — by treating the platform not as an app with an API bolted on, but as **infrastructure other agents and power users drive natively**. The section numbers below reference feature-list.md; cross-references to other sections use the same numbering convention.

---

## 1. Feature-by-Feature Mapping

### F221 — MCP server (first-class, not an afterthought)

**Definition.** A production-grade Model Context Protocol (MCP) server that exposes the Domio deck engine as a callable resource surface, so any MCP-compatible client (Claude, GPT, third-party agents, internal automations) can create decks, edit slides, query data, and read back structured deck state as part of its own workflows.

**Acceptance criteria.**

- The MCP server is reachable over both stdio (local sandbox) and streaming-HTTP (networked) transports, with full SSE notification support.
- A client with no prior knowledge of Domio can call `initialize` → `tools/list` → `tools/call` and complete a non-trivial edit (add slide, bind data, apply theme) without consulting external documentation.
- The server implements the MCP specification version current at GA, including all 2025-06+ revisions of: protocol revision, capability negotiation, request/response correlation, error codes, progress notifications, and resource subscription.
- The server speaks the latest MCP feature additions (prompts, resources, tools, roots, sampling) where they apply.
- MCP traffic is observable, rate-limited, and audit-logged per the agent audit trail (F227).

**Behavioral details.** The server is a stateless front for the platform's mutation and query services. Each session is short-lived (≤ 30 min idle, ≤ 24 h lifetime) and bound to a freshly-minted `mcp_session` token. Handshake returns server capabilities; the client then subscribes to specific resources (e.g., `deck://{deck_id}/structure`) and invokes tools. Tools always return RFC-7807-style problem-detail JSON on failure, with structured error codes that downstream agents can programmatically branch on.

**Edge cases.**

- Resume after reconnect: client may re-issue `initialize` with the previous session token; the server re-establishes the prior subscriptions.
- Mid-session permission escalation: refused, returns `permission_denied`; the client must request a new token.
- Server restart: clients reconnect; in-flight `tools/call` are returned as `request_cancelled` and clients are expected to retry with idempotency keys.
- Read-only contexts where the client has indicated `readonly: true` in `initialize`: any mutating tool call returns `read_only_mode` without side effects.

---

### F222 — Full MCP tool surface

**Definition.** A granular, opinionated catalogue of MCP tools that let an agent make **surgical edits** rather than wholesale regenerations. Tool names, inputs, and outputs are stable contracts and versioned together with the MCP schema version.

**Acceptance criteria.**

- Each tool listed below is reachable by name, with documented JSON-schema input/output, and a one-line description deriving from the schema (not free-form prose) so descriptions never go stale.
- Granularity: at least one tool exists per loosely-coupled editor subsystem (slide creation, element editing, data binding, theming, component insertion, scenario execution, export).
- Each tool is idempotent under retries when given an idempotency key.

**Tool catalogue (initial surface).**

| Tool                     | Purpose                                                 | Idempotency key |
| ------------------------ | ------------------------------------------------------- | --------------- |
| `create_deck`            | Create a new deck from brief, template id, or empty.    | required        |
| `add_slide`              | Append or insert a slide at semantic index.             | required        |
| `edit_element`           | Mutate one property of one element by semantic address. | optional        |
| `batch_edit_elements`    | Apply many `edit_element` operations atomically.        | required        |
| `bind_data_source`       | Connect a data binding (Sheets, Airtable, SQL, REST).   | required        |
| `unbind_data_source`     | Remove a data binding.                                  | required        |
| `apply_theme`            | Apply a theme or design tokens to a deck or selection.  | required        |
| `get_deck_state`         | Return full or scoped deck schema snapshot.             | n/a             |
| `render_slide_to_image`  | PNG/PDF render of one slide, for visual verification.   | n/a             |
| `list_components`        | Enumerate available components for a given context.     | n/a             |
| `insert_component`       | Place a component instance with initial props.          | required        |
| `update_component_props` | Apply typed props to a component instance.              | required        |
| `run_scenario`           | Switch scenario state (Base/Bull/Bear or custom).       | required        |
| `export_deck`            | Render to PDF/PPTX/MP4/scrollytelling-web.              | required        |
| `summarize_deck`         | Call the comprehension endpoint (F235).                 | n/a             |
| `lint_deck`              | Call the agent linter (F237).                           | n/a             |
| `diff_decks`             | Call the diff endpoint (F240).                          | n/a             |
| `simulate`               | Run a parameter sweep (F239).                           | required        |
| `patch_deck`             | NL patch endpoint (F234).                               | required        |
| `dry_run`                | Submit a patch for review without applying (F228).      | required        |

**Edge cases.**

- Missing prerequisites (e.g., `add_slide` before `create_deck`): returns `precondition_failed` with a pointer to the missing step.
- Atomic batch failure: `batch_edit_elements` either applies all or returns dry-run output plus a structured reason; never partial application.
- Schema mismatch: typed props (F233) failing JSON Schema validation return `validation_failed` with a JSON-Pointer location.

---

### F223 — Structured deck schema (JSON/YAML) as the source of truth

**Definition.** The visual canvas is one view onto a canonical, deterministic, language-agnostic schema. Same schema is round-trippable through JSON and YAML, and is the source of truth that the canvas, MCP tools, and the deck-as-code surface (F224) all read and write.

**Acceptance criteria.**

- Any state reachable through the canvas is reachable through the schema and vice versa (round-trip property).
- A pure function `schema ⇄ canvas` is referenceable as a unit test for every shipped version.
- Schema versioning is explicit; mutations check `deck_schema_version` and refuse to apply against a deck stored at an unsupported version unless an explicit migration is requested.

**Edge cases.**

- Schema upgrade: the engine offers a `migrate_deck_schema(target_version)` tool that runs a tested pipeline; the operation is itself dry-run-capable.
- Partial roll-back: a schema authored offline that omits a required field is rejected at validation with a precise pointer.

---

### F224 — Deck-as-code mode

**Definition.** A text/YAML representation of the entire deck that is diffable, git-friendly, editable in a real code editor, and kept in two-way sync with the visual canvas. The representation is the same data as the JSON schema (F223), with a YAML codec on top.

**Acceptance criteria.**

- Round-trip a deck through `deck → YAML → deck` with zero semantic loss and byte-stable output for non-edited decks.
- The YAML representation is a single file (or a fan-out of one file per slide, configurable) suitable for git workflows.
- Two-way sync is conflict-free under CRDT semantics (same as §1, F21) so a git pull and a canvas edit can reconcile without data loss.
- CLI and MCP tools can both read/write the YAML directly.

**Edge cases.**

- Drift detection: after a round-trip, the schema engine re-emits the YAML and flags unjustified diffs (typically comments preserved; reorder of keys is normalized).
- Concurrent edits: CRDT resolves canvas-vs-YAML conflicts deterministically; the resolved state is replayable.

---

### F225 — Agent-scoped permissions

**Definition.** A permission model that lets an operator hand an agent real editing power without handing it the whole workspace. MCP sessions and API keys carry a `mcp_permission_scope` that constrains what tools and resources the session can touch.

**Acceptance criteria.**

- Scopes are composable and deny-by-default: a session has only what its scopes explicitly grant.
- Available scopes (minimum): `deck:read`, `deck:write`, `deck:{id}` (deck-scoped), `data:bind`, `data:writeback`, `brand:lock_aware`, `theme:write`, `component:write`, `export:run`, `audit:read`, `lint:run`, `simulation:run`, `diff:run`.
- A scope check is enforced on every tool call; the audit trail records both the requested tools and the scopes in effect.

**Edge cases.**

- Brand-locked regions: a write targeting a brand-locked element is rejected unless the scope `brand:lock_aware` is present, and even then only specific override roles can pass.
- Cross-deck operations: the scope `deck:{id}` is required for any tool that takes a `deck_id`; requesting a deck outside the scope returns `permission_denied`.
- Read-only mode: the server refuses to even negotiate the `tools` capability if `read-only` is the only scope.

---

### F226 — Semantic element addressing

**Definition.** Every element has a stable, human- and agent-readable identifier and **role** that survives reordering, insertions, and deletions, so an agent's edit from last week still resolves correctly even after a human reorganizes slides.

**Acceptance criteria.**

- Identifier format: `slide[{n|semantic_name}].{element_type}[{semantic_id}]` (e.g., `slide[overview].chart[revenue_by_region]`).
- Identifiers are stable across reorders; the engine maintains a persistent mapping in the `semantic_address_registry` data model.
- Address resolution is O(1) for typical decks, and the engine refuses to resolve if the address has been remapped beyond a recorded lineage (it returns `address_ambiguous` with a list of candidate addresses — never silently picks one).

**Edge cases.**

- Renames: a human renaming a slide updates the semantic address; the system emits a renames log so agents can update their references.
- Deletions: deletion of an element keeps the address slot reserved for a configurable grace period (default 7 days) so an agent's late edit returns `element_pending_creation` rather than silently no-op.
- Ambiguity: when two elements share semantic ids (e.g., parallel scenarios), the address takes a disambiguator `[scenario=bull]`.

---

### F227 — Tool-call transcript / agent audit trail

**Definition.** Every action an agent takes on a deck is logged distinctly from human edits, with full provenance preserved and visible in version history.

**Acceptance criteria.**

- Each `agent_audit_event` carries: timestamp, session id, agent identity (provider, model, declared agent name), tool name, idempotency key, args hash, result, scopes in effect, and a human-readable summary.
- The audit log is append-only and hash-chained (F-section 7, integrity requirement).
- The version history UI distinguishes "Agent: Claude via MCP — added slide 7, bound to Q3 sheet" from human edits with a separate icon and color.
- A retention policy (90 days minimum, configurable per enterprise) is honored.

**Edge cases.**

- Reversal: if a tool call is rolled back, the audit log records both the original and the reversal event linked by a `reverses_event_id`.
- PII: payloads are scanned for PII at log time and redacted; the redaction itself is logged (F-section 10, PII redaction).

---

### F228 — Dry-run / preview mode for agent edits

**Definition.** A "suggestion mode for agents" — an agent submits a proposed diff and a human approves before it lands. This is structurally identical to suggestion mode (F182) for human collaborators but exposed as a tool and an API.

**Acceptance criteria.**

- `dry_run` returns a `dry_run_patch` containing the proposed deltas, a human-readable summary, and a token used to apply or discard.
- Patches are diffable against the current deck schema (F240) and addressable by semantic ids (F226).
- A patch has a TTL (default 7 days, configurable); after which it is auto-discarded.
- Patches can be commented on (via the existing comment thread system, F179) and combined.

**Edge cases.**

- Conflicting patches: applying patch B after A is applied is validated; if B depends on stale state, the engine returns `patch_stale` with a fresh diff.
- Partial application: never allowed; atomic.
- Expired patch: returns `patch_expired`; the agent must re-derive.

---

### F229 — Webhooks → agent triggers

**Definition.** When a data source updates, an agent workflow is invoked (not just a notification fired) to regenerate the affected slides, then flag changes for human review.

**Acceptance criteria.**

- A `webhook_trigger` declaration defines: source event, target agent workflow, optional input transform, and a review policy.
- The webhook dispatcher is responsible for: webhook signature verification, idempotency, dead-letter queue, retry policy, and observability.
- Triggered workflows respect the declaring token's `mcp_permission_scope`; cross-deck workflows require explicit grants.

**Edge cases.**

- Event storms: rate-limited per source; throttled events coalesce into a single "since-X" trigger.
- Trigger loop: a workflow that mutates the source must be declared with a `feedback_loop_allowed: false` flag; otherwise the dispatcher refuses to invoke.
- Signed payloads: all webhook payloads are signed (F-section 7).

---

### F230 — Agent-to-agent handoff

**Definition.** A pipeline where multiple agents — research → deck-builder → brand-compliance → rehearsal coach — exchange work via the platform, with the whole flow inspectable as a first-class object.

**Acceptance criteria.**

- An `agent_pipeline_run` is created when the first agent starts; subsequent `subagent_handoff` events are appended.
- The pipeline inspector UI shows each step, its inputs, outputs, and the agent's declared intent vs. observed outcome.
- Each step is one agent invocation; the pipeline is replayable (re-running with the same inputs yields the same outputs, modulo LLM non-determinism, which is surfaced explicitly).

**Edge cases.**

- Step failure: optional retry, then `pipeline_halted` with a clear pointer.
- Branching: a pipeline can fork (e.g., "research routes to both outline and compliance"); the inspector renders the DAG.
- Resume: a halted pipeline can be resumed from the failed step; later steps are re-evaluated.

---

### F231 — CLI for power users (`deckctl`)

**Definition.** A command-line interface — `deckctl` — that mirrors the MCP tool surface for scripting and CI use. The CLI is first-class, not a wrapper.

**Acceptance criteria.**

- Commands cover: `create`, `push`, `pull`, `diff`, `lint`, `apply`, `simulate`, `summarize`, `render`, `export`, `whoami`, `login`, `audit`.
- Output is JSON by default (scriptable), with a `--human` flag for human-readable output.
- Exit codes are stable and documented: `0` success, `1` generic failure, `2` validation, `3` permission, `4` not found, `5` conflict, `6` patch stale.
- Subcommands accept input from stdin, files via `-`, and large diffs via `--batch-file`.
- Shell completion is generated for bash, zsh, and fish.

**Edge cases.**

- Large decks: streaming mode avoids loading the entire schema into memory.
- Detached CI: the CLI is safe to run from a CI runner with no TTY, and does not prompt.

---

### F232 — Local-first / offline SDK mode

**Definition.** An embeddable, self-hostable rendering + schema engine so an org (or a privacy-conscious individual) can run the core engine without the SaaS backend, syncing later if desired.

**Acceptance criteria.**

- The SDK is packaged as a single binary (CLI) plus a library (Rust/Node/Python bindings) with no required network connections.
- The engine is deterministic: same schema + same renderer settings yields byte-identical output (F-section 8).
- "Sync later" is optional: when a server is reachable, the SDK can pull/push to the canonical platform; when not, it operates as a stand-alone.

**Edge cases.**

- Schema drift between SDK and server: the SDK declares its `local_engine_state` version; the server reconciles on sync.
- Differing renderers: the deterministic renderer is the source of truth; the SDK refuses to render if the deterministic guarantee is at risk.

---

### F233 — Function-calling-ready component props

**Definition.** Every smart component (F25) exposes its editable props as a typed JSON Schema specifically so LLMs can fill them via structured output/tool calling, not just via a form UI.

**Acceptance criteria.**

- For every published component, the `component_prop_schema` is a JSON Schema document plus a UI hint layer.
- The schema is published via the capability discovery endpoint (F236) and as a downloadable artifact.
- The runtime validates every prop update against the schema, returning `validation_failed` with details.

**Edge cases.**

- Schema evolution: a schema update is versioned; old agent calls continue to work until the deprecation window expires.
- Optional UI hints: missing hints are acceptable; the structural schema is mandatory.

---

### F234 — Natural-language patch API

**Definition.** A high-level convenience endpoint — `POST /decks/{id}/patch {"instruction": "..."}` — that wraps the granular tools for agents that want one-shot edits without orchestrating multiple tool calls.

**Acceptance criteria.**

- The endpoint takes an instruction, a target deck, an optional scope (e.g., "slide 5 only"), and returns a `dry_run_patch` (F228) plus the proposed chained tool calls.
- The endpoint is always dry-run by default; the caller must opt in to apply.
- A pipeline description is returned so the agent (or a human) can read the chain of operations.

**Edge cases.**

- Ambiguity: the endpoint returns `instruction_ambiguous` with two or more candidate interpretations, never silently picks.
- Prompt injection: the instruction is treated as user input; the system prompt is fixed and isolated (F-section 7).

---

### F235 — Agent-readable deck comprehension endpoint

**Definition.** `get_deck_summary` returns a structured, non-visual description of every slide's content, data bindings, and intent — so an agent can "read" a deck without OCR-ing rendered images.

**Acceptance criteria.**

- The `comprehension_summary` contains: per-slide intent, content blocks, data bindings (with lineage from F215), components used, animations/timelines (F85–F95), and a deck-level summary.
- PII is redacted at this layer (F-section 7).
- The endpoint is paginated and supports a `depth` parameter (titles / outlines / full structured).

**Edge cases.**

- Decks with embedded video (F75) and 3D (F65): the summary notes their presence and intent but does not transcribe them.
- Long decks: streaming response with page tokens.

---

### F236 — Capability discovery

**Definition.** An MCP `list_tools` / `describe_schema` call rich enough that an agent can learn the full editing surface at runtime without prior knowledge of Domio.

**Acceptance criteria.**

- `tools/list` returns the full tool catalogue with JSON Schema inputs and outputs.
- `resources/list` returns the resource URIs (e.g., `deck://{id}/structure`, `deck://{id}/audit`).
- `prompts/list` returns optional prompt templates.
- A `describe_schema` tool returns the full deck schema (F223) and component prop schemas (F233).

**Edge cases.**

- Versioning: capabilities are versioned; the schema's `version` field is the canonical reference.
- Discovery cost: the surface is small enough to return in a single round-trip.

---

### F237 — Deck linting for agents (extension)

**Definition.** A validation pass an agent can run before finalizing: checks for broken data bindings, orphaned components, off-brand colors, accessibility issues — the machine-readable counterpart to F46 / F121 / F122, callable as a single tool.

**Acceptance criteria.**

- `lint_deck` returns an `agent_lint_result` with one or more lint items, each with severity, location (semantic address), rule id, and a suggested fix (when deterministic).
- Lint rules are versioned; new rules can be added without breaking callers.
- Run budget: ≤ 2 s for a 50-slide deck (F-section 8).

**Edge cases.**

- Custom rules: an org can define lint rules; lint results include the rule source.
- Suppressions: a lint item can be suppressed via a record on the element, visible to all agents.

---

### F238 — Confidence/uncertainty surfacing (extension)

**Definition.** When AI generates a chart interpretation or narrative (F110), it flags which claims are strongly data-supported vs. inferential, so a human reviewer (or a downstream compliance agent) knows what to double-check.

**Acceptance criteria.**

- Each claim in a generated narrative returns an `uncertainty_flag` with: confidence (0–1), basis (data source, derivation, inference), and human-verification status.
- The summary endpoint (F235) includes these flags per slide.
- The lint endpoint (F237) can flag low-confidence claims.

**Edge cases.**

- Stale data: a claim derived from a stale data source has its confidence lowered automatically (F-section 12, freshness signals).
- Override: a human can explicitly mark a claim as verified, which updates the audit trail (F227).

---

### F239 — Simulation mode for scenario testing (extension)

**Definition.** An agent can programmatically sweep the what-if sliders (F53) across a range and get back the resulting numbers, useful for automated sensitivity analysis rather than a human dragging one slider at a time.

**Acceptance criteria.**

- `simulate` takes one or more input parameters (with ranges) and produces a `simulation_run` record with the sampled output.
- The sweep is deterministic given the same inputs and engine version.
- Results are returned in CSV/JSON and streaming via SSE.

**Edge cases.**

- Combinatorial explosion: a sweep with N parameters × M samples is bounded; the server returns `simulation_too_large` with a suggested reduction.
- Caching: identical sweeps return cached results.

---

### F240 — Deck diffing API for agents (extension)

**Definition.** A structured diff between two deck versions (not just visual diff for humans, F183), so an agent can programmatically detect "what changed" and decide whether to re-notify, re-approve, or re-generate downstream content.

**Acceptance criteria.**

- `diff_decks` returns a `deck_diff` with: list of changes, each with location (semantic address), type (added / removed / modified / moved), and a unified-diff payload for textual elements.
- Diffs are produced by semantic address, not by raw position — so reordering doesn't produce noise.
- Diff is deterministic and reverse-applicable.

**Edge cases.**

- Bulk reorders: a diff that moves 50 slides is reported as a single bulk move with a structured manifest, not 50 individual moves.
- Schema migrations: deep changes are reported with a migration identifier.

---

## 2. UX Flows

### 2.1 External agent using MCP tools to edit a slide

**Scenario.** Sarah, an analyst at a fintech, has an agent (call it "DeckBot") that monitors the company's warehouse. Detecting a new anomaly in churn, the agent pulls the affected slides and edits one to reflect the new data.

```
[Agent] → MCP initialize  (auth: bearer, scopes: deck:Q3Board:read+write, data:bind)
[Server] → capabilities, available tools, resources
[Agent] → resources/read deck://Q3Board/structure
[Server] → full schema (F223)
[Agent] → tools/call get_deck_summary  (F235)
[Server] → comprehension_summary with intent per slide
[Agent] → tools/call edit_element  (semantic address: slide[churn].chart[churn_by_region])
[Server] → 200 OK, returns updated element
[Agent] → tools/call render_slide_to_image  (for verification)
[Server] → PNG bytes
[Agent] → resources/subscribe deck://Q3Board/audit
[Server] → audit event published with agent identity
```

**UI side.** When Sarah opens the deck, she sees the slide has been edited, with a banner: "Edited by DeckBot via MCP — 3 minutes ago." The version history (F20) shows the agent edit distinct from prior human edits.

**Edge cases.**

- If `edit_element` exceeds the scope, the server returns `permission_denied` and the agent records the failure.
- If the agent's edit is later rejected by the lint pass (F237), the audit trail contains both the agent's action and the lint failure.

### 2.2 Agent submitting a dry-run patch

**Scenario.** A marketing agent wants to apply a major restructure to a deck but the deck is brand-locked.

```
[Agent] → dry_run  {deck_id: "LaunchPlan", operations: [...]}
[Server] → dry_run_patch {token: "dr_xyz", summary: "...", ttl: 7d}
[Agent] → patch_deck  (instruction: "make slide 5's chart a waterfall and shorten the headline")
[Server] → dry_run_patch {token: "dr_abc", chain: [edit_element, edit_element], summary: "..."}
[Agent] → POST /decks/LaunchPlan/patches/dr_abc/comments  {comment: "Brand review please"}
[Server] → 200 OK, comment attached
[Human] → opens Deck, sees the pending patch, clicks "Apply"
[Server] → patch applied atomically; audit event recorded
```

**UI side.** The pending patch banner shows the proposed diff, the chain of operations, and a button bank: Apply / Discard / Comment.

### 2.3 Webhook triggering an agent workflow

**Scenario.** A Sheets data source updates; the dispatcher invokes the "Q3 weekly refresh" agent workflow.

```
[Sheets] → POST /webhooks/{id}  (signed payload)
[Dispatcher] → verify signature, idempotency check, enqueue
[Dispatcher] → mcp_session  (scopes: deck:Q3Board:write, data:bind, brand:lock_aware)
[Worker] → agent runs: regenerate affected slides → flag diff for review
[Worker] → dry_run_patch  (proposed changes)
[UI] → notification: "Q3Board has a pending patch from the weekly refresh agent"
```

**Edge cases.** If the Sheets hook is replayed, the dispatcher returns the cached result. If the agent errors, the dispatcher dead-letters after N retries.

### 2.4 Agent-to-agent handoff pipeline

**Scenario.** A presentation is assembled from raw research, then reviewed by brand-compliance, then by the rehearsal coach.

```
[Research Agent] → produces research.md
[Pipeline] → records handoff: research → deck-builder
[Deck-Builder Agent] → produces slide draft  (MCP)
[Pipeline] → records handoff: deck-builder → brand-compliance
[Brand-Compliance Agent] → lint_deck → produces review
[Pipeline] → records handoff: brand-compliance → rehearsal-coach
[Rehearsal-Coach Agent] → speaker notes & pacing
[Pipeline] → terminates with audit summary
```

**UI side.** The pipeline inspector shows the DAG, the inputs/outputs per step, and the cumulative time. A user can replay any step.

### 2.5 Developer using deckctl in CI

**Scenario.** A dev wants a CI pipeline that opens a PR, regenerates a deck from the latest warehouse, and uploads a PDF artifact.

```
$ deckctl login --token $DECKCTL_TOKEN
$ deckctl pull deck://Q3Board --format yaml > deck.yaml
$ deckctl lint deck.yaml --format json
$ deckctl diff deck.yaml --against $PRIOR_SHA --format json
$ deckctl apply deck.yaml --idempotency-key $BUILD_SHA
$ deckctl render deck://Q3Board --format pdf --output q3.pdf
```

**CI integration.** The pipeline fails with `exit 2` if lint fails, `exit 5` if diff is non-empty (configured gate), and uploads the PDF as a build artifact.

---

## 3. Functional & Non-Functional Requirements

### 3.1 MCP server protocol conformance

The MCP server conforms to the MCP specification version current at GA, including:

- Capability negotiation on `initialize`.
- Request/response correlation via JSON-RPC 2.0 ids.
- Structured error codes (`invalid_request`, `method_not_found`, `permission_denied`, `internal_error`, plus Domio-specific extensions).
- SSE notification support for resource updates and progress.
- Idempotency keys on mutating tools.
- Versioning via `protocol_version` field.

**NFR:** server passes the official MCP conformance test suite at every release.

### 3.2 Tool surface granularity

Tools are mapped to subsystems, not to UI screens. Granularity is chosen so that 90% of agent edits can be done with 1–3 tool calls rather than regenerating. Granularity must not be so coarse that an agent must overwrite unrelated state.

### 3.3 Structured schema (JSON/YAML) round-trip with canvas

**NFR:** round-trip `deck → JSON → deck` and `deck → YAML → deck` are byte-identical for non-edited decks. Round-trip latency ≤ 200 ms for a 50-slide deck on reference hardware.

### 3.4 Deck-as-code diffability

**NFR:** the YAML representation is diffable at the YAML level (key add/remove/change) and at the semantic level (semantic address). Git-friendly property: no auto-generated timestamps in the YAML, deterministic key ordering.

### 3.5 Agent permission scoping semantics

Deny-by-default. Composable scopes. Scope check is enforced at every tool call (not just at the session boundary). Permission decisions are logged in the audit trail.

### 3.6 Semantic element addressing stability

**NFR:** semantic addresses persist across reorders, with a renames log. After a deck has 100 reorderings, 100% of original addresses still resolve.

### 3.7 Audit trail fidelity

Append-only, hash-chained, with separate "human" and "agent" identification. Each event captures the agent's identity, the scopes in effect, the idempotency key, and the tool result.

### 3.8 Dry-run safety

A dry-run patch is a pure function of (current_schema, proposed_ops). Applying the patch is atomic. The patch has a TTL and a token.

### 3.9 Webhook-to-agent invocation semantics

Webhook signatures are verified (HMAC-SHA256). Idempotency keys are derived from the source event. The dispatcher is rate-limited per source. Dispatch is observable end-to-end.

### 3.10 Agent-to-agent handoff inspection

The pipeline is a first-class object. The inspector shows the DAG, per-step inputs/outputs, and the inferred intent vs. observed outcome.

### 3.11 CLI performance and scripting UX

**NFR:** `deckctl --help` exits in ≤ 50 ms; subcommands exit in ≤ 200 ms for a 50-slide deck (excluding network). Output is JSON by default; `--human` for human-readable.

### 3.12 Local-first engine determinism

**NFR:** given the same `local_engine_state` version and the same schema, the engine produces byte-identical output deterministically (cross-platform).

### 3.13 JSON Schema component props

**NFR:** every component publishes a JSON Schema draft 2020-12 document. Prop updates are validated against it.

### 3.14 NL patch API safety

NL patch is always dry-run by default. The caller must explicitly opt in to apply. Prompt injection defenses are documented in §7.

### 3.15 Comprehension endpoint richness

The `comprehension_summary` covers intent, content, data bindings, components, and animations at multiple depth levels.

### 3.16 Capability discovery depth

A single `tools/list` + `resources/list` + `prompts/list` round-trip is sufficient for an agent to learn the surface.

### 3.17 Agent linting thoroughness

Lint rules cover: broken data bindings, orphaned components, off-brand colors, accessibility (contrast, alt-text, reading order), schema validation, deprecated components. Custom rules supported.

### 3.18 Uncertainty surfacing transparency

Every claim in a generated narrative has an `uncertainty_flag` with confidence, basis, and verification status.

### 3.19 Simulation sweep semantics

A sweep is deterministic given the inputs and engine version. Combinatorial bounds are enforced. Results are streamable.

### 3.20 Deck diff API precision

Diffs are by semantic address. Bulk operations are reported as bulk. Diffs are reverse-applicable.

---

## 4. Architecture

### 4.1 Component inventory

| Component                               | Responsibility                                                                            |
| --------------------------------------- | ----------------------------------------------------------------------------------------- |
| **MCP server**                          | Hosts the full tool surface; routes to mutation/query services.                           |
| **Structured schema service**           | Owns the deck JSON schema; issues `deck_schema_version`; performs JSON Schema validation. |
| **Deck-as-code engine**                 | Two-way sync between YAML and canvas; CRDT-backed.                                        |
| **Agent permission / identity service** | Issues short-lived tokens; enforces scopes; tracks agent identity.                        |
| **Semantic address registry**           | Maintains stable addresses across operations; emits renames.                              |
| **Audit trail service**                 | Append-only, hash-chained, with agent/human distinction.                                  |
| **Dry-run preview engine**              | Computes atomic dry-run patches; produces diffable outputs.                               |
| **Webhook-to-agent dispatcher**         | Verifies signatures, enqueues, retries, escalates.                                        |
| **Agent pipeline inspector**            | Renders DAG of an `agent_pipeline_run`; replayable.                                       |
| **CLI tool (`deckctl`)**                | Scriptable CLI mirroring MCP; ships in CI.                                                |
| **Local-first engine SDK**              | Embeddable, deterministic core engine.                                                    |
| **Component prop JSON Schema registry** | Publishes per-component schemas.                                                          |
| **NL patch service**                    | Wraps the granular tools; returns a dry-run patch plus chain.                             |
| **Comprehension service**               | Extracts structured summary from a deck.                                                  |
| **Capability discovery service**        | Serves `list_tools`, `describe_schema`, `resources/list`.                                 |
| **Agent linter**                        | Runs validation rules; surfaces results.                                                  |
| **Uncertainty surfacer**                | Tags generated claims with confidence + basis.                                            |
| **Simulation runner**                   | Executes parameter sweeps; deterministic.                                                 |
| **Deck diff service**                   | Computes semantic-addressed diffs.                                                        |

### 4.2 High-level diagram (textual)

```
┌──────────────────────────────────────────────────────────────┐
│                       External clients                        │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────┐  │
│  │ MCP clients │  │  deckctl    │  │  Webhooks (signed)   │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬───────────┘  │
└─────────┼────────────────┼────────────────────┼──────────────┘
          │                │                    │
          ▼                ▼                    ▼
┌──────────────────────────────────────────────────────────────┐
│                      Edge / API layer                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐│
│  │ MCP server   │  │ CLI gateway  │  │ Webhook dispatcher   ││
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────────────┘│
└─────────┼────────────────┼────────────────┼──────────────────┘
          │                │                │
          ▼                ▼                ▼
┌──────────────────────────────────────────────────────────────┐
│                  Core agentic services                        │
│  ┌───────────────┐  ┌──────────────┐  ┌─────────────────────┐│
│  │ Permission    │  │ Audit trail  │  │ Pipeline inspector  ││
│  │ service       │  │ service      │  │                     ││
│  └──────┬────────┘  └──────┬───────┘  └──────┬──────────────┘│
│         │                  │                  │               │
│  ┌──────┴────────┐  ┌──────┴───────┐  ┌──────┴──────────────┐│
│  │ Semantic addr │  │ Dry-run      │  │ NL patch service    ││
│  │ registry      │  │ preview      │  │                     ││
│  └──────┬────────┘  └──────┬───────┘  └──────┬──────────────┘│
│         │                  │                  │               │
│  ┌──────┴────────┐  ┌──────┴───────┐  ┌──────┴──────────────┐│
│  │ Schema        │  │ Deck-as-code │  │ Component prop      ││
│  │ service       │  │ engine       │  │ JSON Schema reg.    ││
│  └──────┬────────┘  └──────┬───────┘  └──────┬──────────────┘│
│         │                  │                  │               │
│  ┌──────┴────────┐  ┌──────┴───────┐  ┌──────┴──────────────┐│
│  │ Comprehension │  │ Linter       │  │ Deck diff service   ││
│  │ service       │  │              │  │                     ││
│  └──────┬────────┘  └──────┬───────┘  └──────┬──────────────┘│
│         │                  │                  │               │
│  ┌──────┴────────┐  ┌──────┴───────┐  ┌──────┴──────────────┐│
│  │ Uncertainty   │  │ Simulation   │  │ Capability          ││
│  │ surfacer      │  │ runner       │  │ discovery           ││
│  └──────┬────────┘  └──────┬───────┘  └──────┬──────────────┘│
└─────────┼────────────────┼────────────────┼──────────────────┘
          │                │                │
          ▼                ▼                ▼
┌──────────────────────────────────────────────────────────────┐
│               Canvas + storage layer (existing)               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐│
│  │ Editor       │  │ Storage      │  │ Renderer (determin.) ││
│  │ canvas       │  │ (CRDT)       │  │                      ││
│  └──────────────┘  └──────────────┘  └──────────────────────┘│
└──────────────────────────────────────────────────────────────┘
```

### 4.3 Interaction style

Synchronous calls for read paths and short mutations (≤ 1 s). Asynchronous for long-running operations (renders, simulations, pipeline runs). Async results are returned via SSE notifications and reconcilable by polling.

### 4.4 Failure & resilience

- Failed tool calls return a structured error; the engine never silently retries.
- The webhook dispatcher retries with exponential backoff and dead-letters after a configurable attempt budget.
- The pipeline inspector shows the failure point and offers resume.

---

## 5. Data Model

The following entities are the heart of the agentic interfaces. They are deliberately minimal but precise enough to drive design.

### 5.1 `mcp_session`

```json
{
  "id": "sess_01H...",
  "agent_identity": {
    "provider": "anthropic",
    "model": "claude-opus-4.8",
    "agent_name": "DeckBot"
  },
  "scopes": ["deck:Q3Board:read", "deck:Q3Board:write", "data:bind"],
  "issued_at": "2026-07-29T10:00:00Z",
  "expires_at": "2026-07-29T10:30:00Z",
  "transport": "streamable_http",
  "protocol_version": "2026-01-01",
  "client_capabilities": {...}
}
```

### 5.2 `mcp_tool_call`

```json
{
  "id": "tc_01H...",
  "session_id": "sess_01H...",
  "tool": "edit_element",
  "args_hash": "sha256:...",
  "args": {...},
  "idempotency_key": "...",
  "started_at": "...",
  "finished_at": "...",
  "result_status": "ok | error",
  "result": {...},
  "scopes_in_effect": ["..."]
}
```

### 5.3 `mcp_permission_scope`

A composable token: `deck:{id?}[:read|:write]`, `data:bind`, `data:writeback`, `brand:lock_aware`, `theme:write`, `component:write`, `export:run`, `audit:read`, `lint:run`, `simulation:run`, `diff:run`. Combined with explicit `deny` overrides.

### 5.4 `deck_schema_version`

```json
{
  "version": "1.4.0",
  "previous_compatible": "1.3.x",
  "migrations": ["mig_1.3_to_1.4"],
  "issued_at": "...",
  "engine_minimum": "sdk-1.4.0"
}
```

### 5.5 `deck_document` (JSON/YAML)

```yaml
deck:
  id: Q3Board
  schema_version: 1.4.0
  slides:
    - id: overview
      type: title
      elements:
        - id: title
          role: heading
          text: 'Q3 Review'
          style: { tokens: { color: theme.text.primary } }
        - id: subtitle
          role: subheading
          text: 'FY26 Q3'
    - id: churn
      elements:
        - id: churn_by_region
          role: chart
          type: bar
          data_binding:
            { source: gsheet:1abc..., query: 'select region, sum(churn)...' }
          props: { animation: 'fade-in' }
```

### 5.6 `deck_diff`

```json
{
  "version": "1.0",
  "from": "deck_version:abc",
  "to": "deck_version:def",
  "changes": [
    {
      "address": "slide[churn].chart[churn_by_region].data_binding",
      "type": "modified",
      "before": "...",
      "after": "...",
      "unified_diff": "@@ ..."
    },
    {
      "type": "bulk_move",
      "items": ["slide[a]", "slide[b]", "..."]
    }
  ]
}
```

### 5.7 `agent_audit_event`

```json
{
  "id": "ae_01H...",
  "session_id": "sess_01H...",
  "actor": { "kind": "agent", "identity": "..." },
  "tool": "edit_element",
  "idempotency_key": "...",
  "args_hash": "...",
  "result_status": "ok",
  "scopes": ["..."],
  "summary": "Edited chart churn_by_region on slide churn",
  "hash_prev": "sha256:...",
  "hash_this": "sha256:..."
}
```

### 5.8 `dry_run_patch`

```json
{
  "token": "dr_xyz",
  "deck_id": "LaunchPlan",
  "operations": [...],
  "summary": "Restructured slide 5 to waterfall",
  "chain": ["edit_element", "edit_element"],
  "ttl_seconds": 604800,
  "created_at": "...",
  "expires_at": "...",
  "status": "pending | applied | discarded | expired"
}
```

### 5.9 `webhook_trigger`

```json
{
  "id": "wh_01H...",
  "source": "gsheet:1abc...",
  "event": "row_changed",
  "agent_workflow": "weekly_refresh",
  "input_transform": "...",
  "review_policy": "manual",
  "feedback_loop_allowed": false,
  "signature_algo": "hmac-sha256",
  "secret_ref": "vault:..."
}
```

### 5.10 `agent_pipeline_run`

```json
{
  "id": "pl_01H...",
  "started_at": "...",
  "steps": [
    {
      "id": "step_1",
      "agent": "research",
      "started_at": "...",
      "finished_at": "...",
      "inputs": {...},
      "outputs": {...},
      "intent": "...",
      "outcome": "...",
      "status": "ok | error",
      "retry_count": 0
    }
  ],
  "status": "ok | error | halted",
  "replayable": true
}
```

### 5.11 `cli_invocation`

```json
{
  "id": "cli_01H...",
  "tool": "deckctl",
  "subcommand": "apply",
  "args": [...],
  "exit_code": 0,
  "duration_ms": 240,
  "host": "ci-runner-123",
  "auth": { "principal": "user:svc:ci", "scopes": ["..."] }
}
```

### 5.12 `local_engine_state`

```json
{
  "engine_version": "sdk-1.4.0",
  "schema_version": "1.4.0",
  "renderer_version": "1.4.0",
  "deterministic": true,
  "last_synced_at": "..."
}
```

### 5.13 `component_prop_schema`

```json
{
  "schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://domio.dev/schemas/components/kpi-card.props.json",
  "type": "object",
  "required": ["value", "label"],
  "properties": {
    "value": { "type": "number" },
    "label": { "type": "string" },
    "trend": { "enum": ["up", "down", "flat", null] },
    "icon": { "type": "string" },
    "precision": { "type": "integer", "minimum": 0, "maximum": 6 },
    "unit": { "type": "string" }
  },
  "additionalProperties": false
}
```

### 5.14 `nl_patch_request`

```json
{
  "deck_id": "Q3Board",
  "instruction": "make slide 5's chart a waterfall and shorten the headline",
  "scope": ["slide[5]"],
  "dry_run": true,
  "idempotency_key": "..."
}
```

### 5.15 `comprehension_summary`

```json
{
  "deck_id": "Q3Board",
  "depth": "full",
  "summary": "Quarterly board review with KPIs and regional breakouts.",
  "slides": [
    {
      "address": "slide[overview]",
      "intent": "Title slide",
      "content_blocks": [...],
      "data_bindings": [],
      "components": ["title", "subtitle"],
      "animations": ["fade-in"]
    }
  ]
}
```

### 5.16 `capability_descriptor`

```json
{
  "tools": [...],
  "resources": [...],
  "prompts": [...],
  "schema_version": "1.4.0",
  "deprecations": []
}
```

### 5.17 `agent_lint_result`

```json
{
  "deck_id": "Q3Board",
  "ruleset_version": "1.4.0",
  "items": [
    {
      "rule_id": "data_binding.broken",
      "severity": "error",
      "address": "slide[churn].chart[regional_breakout].data_binding",
      "message": "...",
      "suggested_fix": { "kind": "rebind", "source": "..." }
    }
  ]
}
```

### 5.18 `uncertainty_flag`

```json
{
  "claim": "Churn decreased 12% driven by EMEA recovery",
  "confidence": 0.74,
  "basis": "data:direct" | "data:derived" | "inference",
  "data_source": "gsheet:1abc...",
  "verified_by": null,
  "verified_at": null
}
```

### 5.19 `simulation_run`

```json
{
  "id": "sim_01H...",
  "deck_id": "PricingModel",
  "params": [
    { "name": "discount", "range": [0, 0.5], "samples": 50 },
    { "name": "volume", "range": [1000, 5000], "samples": 50 }
  ],
  "engine_version": "sdk-1.4.0",
  "results": [
    {
      "params": { "discount": 0.1, "volume": 2500 },
      "outputs": { "revenue": 1234567 }
    }
  ],
  "deterministic": true
}
```

---

## 6. APIs and Contracts

### 6.1 MCP tool spec (excerpt)

```json
{
  "name": "edit_element",
  "description": "Mutate one property of one element by semantic address.",
  "input": {
    "type": "object",
    "required": ["deck_id", "address", "op"],
    "properties": {
      "deck_id": { "type": "string" },
      "address": {
        "type": "string",
        "pattern": "^slide\\[[^\\]]+\\]\\.[a-zA-Z_]+\\[[^\\]]+\\](\\.[a-zA-Z_]+)?$"
      },
      "op": {
        "type": "object",
        "required": ["path", "value"],
        "properties": {
          "path": { "type": "string" },
          "value": {}
        }
      },
      "idempotency_key": { "type": "string" }
    }
  },
  "output": {
    "type": "object",
    "required": ["element"],
    "properties": {
      "element": { "type": "object" },
      "version": { "type": "string" }
    }
  }
}
```

### 6.2 JSON Schema for the deck (excerpt)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://domio.dev/schemas/deck.document.json",
  "type": "object",
  "required": ["deck"],
  "properties": {
    "deck": {
      "type": "object",
      "required": ["id", "schema_version", "slides"],
      "properties": {
        "id": { "type": "string", "pattern": "^[A-Za-z0-9_-]+$" },
        "schema_version": { "type": "string" },
        "slides": { "type": "array", "items": { "$ref": "#/$defs/slide" } }
      }
    }
  },
  "$defs": {
    "slide": {
      "type": "object",
      "required": ["id"],
      "properties": {
        "id": { "type": "string" },
        "type": { "type": "string" },
        "elements": { "type": "array", "items": { "$ref": "#/$defs/element" } }
      }
    },
    "element": {
      "type": "object",
      "required": ["id", "role"],
      "properties": {
        "id": { "type": "string" },
        "role": { "type": "string" },
        "type": { "type": "string" },
        "text": { "type": "string" },
        "style": { "type": "object" },
        "data_binding": { "$ref": "#/$defs/data_binding" }
      }
    },
    "data_binding": {
      "type": "object",
      "required": ["source", "query"],
      "properties": {
        "source": { "type": "string" },
        "query": { "type": "string" }
      }
    }
  }
}
```

### 6.3 Deck-as-code YAML schema

The YAML representation is profile-constrained to the JSON schema above. Schema validation is performed at parse time; the YAML decoder rejects inputs that fail JSON Schema validation.

### 6.4 Agent permission tokens

```json
{
  "type": "object",
  "required": ["principal", "scopes"],
  "properties": {
    "principal": { "type": "string" },
    "scopes": { "type": "array", "items": { "type": "string" } },
    "deny": { "type": "array", "items": { "type": "string" } },
    "expires_at": { "type": "string", "format": "date-time" }
  }
}
```

### 6.5 Webhook subscription API

```http
POST /v1/webhooks
Content-Type: application/json
Authorization: Bearer {token}

{
  "source": "gsheet:1abc...",
  "event": "row_changed",
  "agent_workflow": "weekly_refresh",
  "input_transform": "jsonpath:$.rows[*]",
  "review_policy": "manual",
  "feedback_loop_allowed": false
}
```

Response:

```json
{
  "id": "wh_01H...",
  "secret": "***",
  "signature_algo": "hmac-sha256"
}
```

### 6.6 Agent pipeline events

SSE channel `agent_pipeline_run/{id}` emits events:

- `step.started`
- `step.finished`
- `step.failed`
- `pipeline.halted`
- `pipeline.completed`

Each event is a JSON object with `step_id`, `agent`, `inputs_summary`, `outputs_summary`.

### 6.7 CLI command spec (excerpt)

```
deckctl [global flags] <subcommand> [flags] [args]

deckctl create <deck_id> [--template T] [--from-yaml -]
deckctl push deck://<id> [--from-yaml -]
deckctl pull deck://<id> [--format yaml|json]
deckctl diff deck://<id> --against <ref> [--format json|yaml|unified]
deckctl lint deck://<id> --format json
deckctl apply deck://<id> [--idempotency-key K]
deckctl simulate deck://<id> --param p=range:0..1:50 --output csv
deckctl summarize deck://<id> [--depth titles|outlines|full]
deckctl render deck://<id> --format pdf --output -
deckctl audit deck://<id> [--actor agent|human|all]
```

### 6.8 Embeddable SDK API

```ts
import { Engine, Schema } from '@domio/engine';

const engine = new Engine({ deterministic: true });
const deck = await Schema.loadYAML('deck.yaml');
const pdf = await engine.render(deck, { format: 'pdf' });
```

### 6.9 JSON Schema for component props

Declared per F5.13.

### 6.10 NL patch endpoint

```http
POST /v1/decks/{id}/patch
Content-Type: application/json
Authorization: Bearer {token}

{
  "instruction": "make slide 5's chart a waterfall and shorten the headline",
  "scope": ["slide[5]"],
  "dry_run": true,
  "idempotency_key": "..."
}
```

Response:

```json
{
  "patch": {
    "token": "dr_abc",
    "operations": [...],
    "chain": ["edit_element", "edit_element"],
    "summary": "..."
  },
  "apply_url": "/v1/decks/Q3Board/patches/dr_abc/apply"
}
```

### 6.11 Comprehension endpoint

```http
GET /v1/decks/{id}/summary?depth=full&page=1&page_size=50
```

### 6.12 Capability discovery

```http
GET /v1/capabilities
```

```json
{
  "tools": [...],
  "resources": [...],
  "prompts": [...],
  "schema_version": "1.4.0"
}
```

### 6.13 Lint endpoint

```http
POST /v1/decks/{id}/lint
Content-Type: application/json
Authorization: Bearer {token}

{ "ruleset_version": "1.4.0" }
```

### 6.14 Uncertainty endpoint

```http
GET /v1/decks/{id}/uncertainty?min_confidence=0.5
```

### 6.15 Simulation endpoint

```http
POST /v1/decks/{id}/simulate
Content-Type: application/json
Authorization: Bearer {token}

{
  "params": [
    { "name": "discount", "range": [0, 0.5], "samples": 50 }
  ],
  "deterministic": true
}
```

### 6.16 Diff endpoint

```http
POST /v1/decks/{id}/diff
Content-Type: application/json
Authorization: Bearer {token}

{ "against": "deck_version:..." }
```

---

## 7. Security

### 7.1 MCP session auth

Sessions are bound to short-lived bearer tokens (15 min idle, 24 h lifetime). Token issuance requires the agent's identity (provider, model, agent name) and requested scopes. Tokens are never logged in plain text; only their hashes are.

### 7.2 Scoped permissions

Scopes are deny-by-default. Cross-deck access requires explicit `deck:{id}` scopes. Brand-locked regions require `brand:lock_aware`. Read-only sessions cannot even list mutating tools.

### 7.3 Agent audit trail integrity

The audit trail is append-only and hash-chained (`hash_prev → hash_this`). Each event is signed with the platform's signing key. Verification is a constant-time operation.

### 7.4 Dry-run safety

A dry-run patch is a pure function of inputs. The patch token is single-use for `apply` and is invalidated after TTL. Patches are validated against the current schema at apply time; stale patches are rejected.

### 7.5 Webhook signing

Webhook payloads are signed with HMAC-SHA256. The signature is verified at the dispatcher. The shared secret is stored in a vault; rotated on demand.

### 7.6 CLI artifact signing

`deckctl` releases are signed; the install process verifies signatures. A local `deckctl` enforces token scopes and refuses to write outside the granted paths.

### 7.7 Local-first engine sandboxing

The local-first SDK runs in a sandbox; no network access is required. File access is bounded to a configured workspace.

### 7.8 JSON Schema validation of component props

Every prop update is validated against the `component_prop_schema`. Validation failures return `validation_failed` with pointers.

### 7.9 NL patch prompt injection defense

The NL patch pipeline treats the instruction as untrusted user input. The system prompt is fixed and isolated. The model's tool calls are restricted to the tools in the scope and validated against the schema. The instruction is rate-limited and length-limited.

### 7.10 Comprehension PII redaction

The comprehension service redacts PII (names, emails, phone numbers, addresses) from summaries. Redactions are recorded in the audit trail.

### 7.11 Lint result audit

Every lint run is recorded as an `agent_audit_event` with the ruleset version and the result hash. Lint results can be replayed.

### 7.12 Diff endpoint access controls

The diff endpoint requires `diff:run` scope. Diffs of brand-locked decks require `brand:lock_aware`. Diff payloads are paginated; bulk moves are reported as bulk.

### 7.13 Cross-cutting

- All secrets are stored in a vault; never in code or env files at rest.
- All inter-service calls are authenticated via mTLS.
- All public endpoints are rate-limited (per token, per IP, per source).
- All input is validated at the API boundary.
- All output is sanitized for PII at the response boundary.

---

## 8. Performance

### 8.1 MCP tool latency

| Tool                    | Target p95                 |
| ----------------------- | -------------------------- |
| `get_deck_state`        | ≤ 150 ms (50-slide deck)   |
| `summarize_deck`        | ≤ 800 ms                   |
| `edit_element`          | ≤ 250 ms                   |
| `batch_edit_elements`   | ≤ 500 ms (≤ 50 ops)        |
| `bind_data_source`      | ≤ 300 ms (validation only) |
| `render_slide_to_image` | ≤ 1.5 s                    |
| `lint_deck`             | ≤ 2 s                      |
| `diff_decks`            | ≤ 1 s                      |
| `simulate`              | streaming                  |

### 8.2 Deck-as-code round-trip

`deck → YAML → deck` and `deck → JSON → deck` round-trip ≤ 200 ms for a 50-slide deck.

### 8.3 Comprehension summary latency

≤ 800 ms for a 50-slide deck (parallelizable; depth-based).

### 8.4 Lint budget

≤ 2 s for a 50-slide deck on reference hardware. Lint runs are resumable.

### 8.5 Simulation sweep throughput

Streamed; ≥ 1,000 samples/s on reference hardware for a 1-parameter sweep.

### 8.6 Diff compute budget

≤ 1 s for a 50-slide deck with ≤ 100 changes. Bulk moves are constant-time.

### 8.7 Determinism

The SDK's `local_engine_state` is deterministic: same schema + same engine version = byte-identical output across platforms.

---

## 9. Observability and Testing

### 9.1 Metrics

Per-service:

- Request rate, error rate, latency (p50, p95, p99).
- Tool-call distribution.
- Scope-denial rate.
- Webhook delivery rate.
- Pipeline-step failure rate.

Per-deck:

- Mutation rate by actor kind (human/agent).
- Comprehension depth distribution.
- Lint warning/error rate.
- Diff rate.

### 9.2 Logs

Structured JSON logs with: trace_id, session_id, agent_id, scopes, tool, idempotency_key, result_status. PII is redacted at log time.

### 9.3 Traces

OpenTelemetry traces across MCP server, schema service, audit service, and downstream services. Pipeline runs are top-level traces with per-step spans.

### 9.4 Alerting

- `5xx` rate > 1% sustained 5 min → page.
- Scope-denial rate > 10% from a single principal → review.
- Webhook dead-letter rate > 5% → review.
- Pipeline failure rate > 5% per agent → review.
- Lint pass rate < 70% → notify ops.

### 9.5 Eval suite for agent actions

A regression eval suite runs nightly and on each PR:

- **Determinism eval:** given a schema and a sequence of tool calls, the resulting deck is identical to the recorded ground truth.
- **Round-trip eval:** deck → JSON → deck and deck → YAML → deck byte-stable.
- **Permission eval:** each scope is denied/allowed as specified.
- **Audit eval:** each agent action has a corresponding audit event with the required fields.
- **Dry-run eval:** a dry-run patch can be applied atomically; a stale patch is rejected.
- **Lint eval:** each rule fires on its known fixture.
- **Comprehension eval:** redacted summaries do not contain PII.
- **Semantic-address eval:** addresses persist across reorders.
- **Diff eval:** a deck → diff → apply round-trip is identity.

### 9.6 Security tests

- MCP session fuzzing.
- Scope enforcement tests.
- Webhook signature verification tests.
- Prompt injection tests against the NL patch endpoint.
- PII redaction tests.

---

## 10. Cross-Section Ties

Every other section of the product spec folds into the agentic layer. The following table is the authoritative cross-reference for implementation sequencing.

| Section                                         | Tie-in                                                                                                                 | How agents use it                                                                                                                                                                                                                                                 |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **§1 — Core Editor (F1–F22)**                   | Canvas as one view onto the schema.                                                                                    | `edit_element`, `add_slide`, `render_slide_to_image` operate on the same state as the canvas. CRDT-based offline editing (F21) means `deckctl push` and online edits merge without conflict. Version history (F20) and unlimited undo (F12) are surfaced via MCP. |
| **§2 — Components & Templates (F23–F36)**       | `component_prop_schema` registry.                                                                                      | `list_components`, `insert_component`, `update_component_props` use the JSON Schema. Brand-locked templates (F36) inform scopes (`brand:lock_aware`).                                                                                                             |
| **§3 — Theming & Design Systems (F37–F47)**     | Design tokens as the schema behind `apply_theme`.                                                                      | `apply_theme` operates on tokens; `lint_deck` includes brand-violation rules (F46). Style linting (F46) is callable as an MCP tool.                                                                                                                               |
| **§4 — Live Data & Charts (F48–F64)**           | Data bindings are first-class in the schema.                                                                           | `bind_data_source`, `unbind_data_source`, `simulate` operate on bindings. Threshold alerts (F60) feed the uncertainty surfacer. Stale-data indicators (F63) feed the linter.                                                                                      |
| **§6 — Animation & Transitions (F85–F95)**      | Animations are part of the schema.                                                                                     | `edit_element` can set animation properties; `summarize_deck` includes them. Reduced-motion mode (F93) is enforced by the linter.                                                                                                                                 |
| **§7 — Prototyping & Interactivity (F96–F107)** | Variables, conditional logic, and device frames are in the schema.                                                     | `edit_element` exposes them; `simulate` sweeps variables (F100). Mini-games (F105) and quizzes (F146) are accessible via the comprehension endpoint.                                                                                                              |
| **§8 — AI Copilot (F108–F125)**                 | AI generation flows are exposed as agent workflows.                                                                    | `generate_deck` (F108) is callable as an MCP tool. Voice-to-deck (F115) is accessible via the speech-recognition pipeline. Semantic deck search (F124) is exposed via MCP.                                                                                        |
| **§9 — Presenter Experience (F126–F141)**       | Presenter state is observable.                                                                                         | `get_deck_state` includes presenter-view metadata. Teleprompter (F132) and parking lot (F133) are bindable.                                                                                                                                                       |
| **§12 — Analytics (F169–F178)**                 | Analytics events are first-class.                                                                                      | `audit` is an MCP tool. Engagement patterns feed the linter (e.g., drop-off on a slide triggers a content-freshness check).                                                                                                                                       |
| **§14 — Enterprise (F193–F204)**                | API (F200), webhooks (F201), plugins (F202), and headless rendering (F204) are conceptually merged with the MCP layer. | `export_deck` calls the headless renderer. The plugin architecture exposes MCP. SSO/SCIM govern agent identities.                                                                                                                                                 |
| **§15 — Novel State (F205–F219)**               | Presentation state timeline (F205) and provenance chips (F215) are agent-readable.                                     | `comprehension_summary` includes the timeline. Provenance is queryable by agent.                                                                                                                                                                                  |

### 10.1 Specific cross-section flows

#### Editor schema → MCP

The schema service (F223) is the same source of truth for the canvas, MCP, and CLI. The MCP tool `get_deck_state` returns the schema; the canvas subscribes to changes via CRDT.

#### Component props → JSON Schema (F233)

Every smart component in §2 publishes a `component_prop_schema`. The schema registry is the join between §2 and §16.

#### Data bindings → MCP (F48–F62)

`bind_data_source`, `unbind_data_source`, `simulate`, and `lint_deck` all operate on the live data layer. The MCP tool `simulate` reuses the what-if slider engine (F53) for sensitivity analysis.

#### Animations → comprehension (F85–F95)

Animations are part of the schema and appear in `comprehension_summary`. The uncertainty surfacer flags claims based on stale data (F63) and the simulation runner reuses the animation timeline for time-aware sweeps.

#### Prototype variables → simulation (F100–F102)

`simulate` sweeps prototype variables. The comprehension endpoint reports them. The lint endpoint flags undefined-variable references.

#### AI assistant tools → MCP (F108–F125)

The AI assistant is itself an MCP-aware client. `generate_deck`, `data_to_story`, `redesign_slide`, `summarize`, and `voice_to_deck` are all MCP tools (and HTTP endpoints). The capability discovery endpoint (F236) lets any agent learn them at runtime.

#### Presenter session → analytics & audit (F126–F141)

The presenter session is part of `get_deck_state`. The audit trail records "Agent: Claude via MCP — started presenter mode" as a distinct event.

#### Analytics exports → audit (F169–F178)

Per-viewer analytics flow into the audit trail. The diff endpoint (F240) can compare two sets of analytics to attribute engagement changes.

#### Enterprise API → MCP (F193–F204)

The MCP server is the canonical external interface. The HTTP REST API exposes the same operations with bearer auth. SCIM provisions agents; SSO governs human users.

#### Novel state timeline → comprehension (F205–F219)

The presentation state timeline (F205) is queryable via MCP. Provenance chips (F215) are queryable by `get_deck_summary`. Two-way slides (F211) are accessible via `edit_element` and `simulate`.

---

## 11. Sequencing & Milestones

The agentic layer is built on top of the editor (section 1), schema service, and audit trail. A suggested milestone path:

- **M1 — Schema core.** Schema service, JSON Schema validation, deterministic engine SDK (F223, F232).
- **M2 — Audit + permissions.** Hash-chained audit, scope enforcement, identity service (F225, F227).
- **M3 — MCP server MVP.** Tool surface, capability discovery (F221, F222, F236).
- **M4 — Deck-as-code.** YAML codec, two-way sync, CRDT (F224).
- **M5 — Component prop schemas.** JSON Schema registry (F233).
- **M6 — Comprehension + dry-run.** Summarizer, dry-run patches (F228, F235).
- **M7 — Lint + uncertainty + diff.** Linter, uncertainty surfacer, diff service (F237, F238, F240).
- **M8 — Webhooks → agent triggers.** Dispatcher, workflow orchestration (F229).
- **M9 — Agent pipelines.** Handoff + inspector (F230).
- **M10 — CLI.** `deckctl` GA (F231).
- **M11 — NL patch + simulation.** Convenience endpoints (F234, F239).

Each milestone ships with: schema updated, audit trail updated, docs updated, eval suite updated.

---

## 12. Acceptance & Definition of Done

A feature in this section is "done" when all of the following hold:

1. Schema updated and validated against the JSON Schema.
2. Audit trail captures the new operation with the required fields.
3. Permission scopes enforced and tested.
4. Capability discovery reflects the new tool.
5. CLI command exists (if user-facing).
6. SDK export updated (if applicable).
7. Comprehension endpoint reflects the change.
8. Lint rules updated (if applicable).
9. Eval suite green.
10. Documentation updated.

---

## 13. Open Questions

- **Q1.** What is the schema-stability policy for `deck_schema_version`? `1.x.y` for backwards compatibility, `2.x` for breaking changes?
- **Q2.** Should the agent pipeline inspector be visible to non-admins by default? (Recommendation: admin-only by default, opt-in for the deck owner.)
- **Q3.** For brand-locked regions, should agents see the lock state in the schema, or only at write time? (Recommendation: schema includes lock state, so comprehension can flag it.)
- **Q4.** What is the retention policy for agent audit events? (Recommendation: 90 days for free, configurable per enterprise.)
- **Q5.** Should the NL patch endpoint be exposed in self-hosted SDK mode? (Recommendation: yes, but with a per-deployment allowlist.)

---

## 14. Reporting

**File path:** `/home/daiyaan2002/Desktop/Projects/domio/docs/agentic-interfaces.md`

**Coverage summary:**

| Required Coverage                        | Status                                                                  |
| ---------------------------------------- | ----------------------------------------------------------------------- |
| Feature-by-feature mapping (F221–F240)   | ✅ 20 features with acceptance criteria, behavioral details, edge cases |
| UX flows (5 flows)                       | ✅ External agent edit, dry-run, webhook, agent-to-agent, deckctl CI    |
| Functional & non-functional requirements | ✅ 20 NFRs                                                              |
| Architecture (18 components)             | ✅ Component inventory + textual diagram                                |
| Data model (19 entities)                 | ✅ Each with JSON Schema or YAML example                                |
| APIs & contracts (16 surfaces)           | ✅ Each with request/response examples                                  |
| Security (13 areas)                      | ✅ Auth, scopes, integrity, signing, sandboxing, PII                    |
| Performance (7 budgets)                  | ✅ p95 targets per tool                                                 |
| Observability & testing                  | ✅ Metrics, logs, traces, alerting, eval suite                          |
| Cross-section ties (11 sections)         | ✅ Authoritative cross-reference table                                  |
| Sequencing & milestones                  | ✅ 11-milestone path                                                    |
| Definition of done                       | ✅ 10-item checklist                                                    |
| Open questions                           | ✅ 5 active questions                                                   |

**Source files.** `/home/daiyaan2002/Desktop/Projects/domio/feature-list.md` and `/home/daiyaan2002/Desktop/Projects/domio/pre-development-planning-guide.md` were read but **not modified**.

**No commits made.** The document is staged at the path above and ready for review.
