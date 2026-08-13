# Changelog

All notable changes to this project are documented here. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Phase 14 — W1: Share-link data plane

#### Added

- **Migration `0041_phase14_sharing.{up,down}.sql`.** Six new tables
  (`share_link`, `link_policy`, `link_visibility_rule`,
  `watermark_profile`, `embed_config`, `seo_metadata`) with RLS keyed
  to `workspace_id`, `UNIQUE (workspace_id, short_id)`, `UNIQUE
(workspace_id, slug)`, and indexes on `token_hash`. The
  watermark/embed/SEO tables are created now but unused at the W1
  API surface — W3/W4/W9 will read them.
- **`packages/signed-link-token`.** TypeScript package exporting:
  - `mintShortId()` — 8-char Crockford base32 with mod-31 checksum;
  - `mintLinkToken({claims, expiresAt}, key)` — HMAC-SHA256 over
    `<payload>.<expires_at_sec>.<nonce>`;
  - `verifyLinkToken(token, key, {nonceStore})` — constant-time
    HMAC compare, expiry check, and nonce-replay rejection;
  - `NonceStore` interface with `InMemoryNonceStore` (TTL-aware,
    Map-backed) and `NullNonceStore` (dev convenience).
    **29 tests.**
- **`packages/audit-ts`.** TypeScript port of the P13 hash-chained
  audit log: `Chain` class with `loadKey`, `rotateKey`, `build`,
  `commit`, `verifyChain`, 7-day rotation overlap and 90-day key
  hard expiry. Wire format is compatible with the Go P13 chain.
  **14 tests.**
- **`services/share-api`.** TypeScript REST service exposing:
  - `POST   /v1/shares` — create (201 with snapshot + token);
  - `GET    /v1/shares/{link_id}` — read (200/404);
  - `PATCH  /v1/shares/{link_id}` — update with `If-Match: <seq>`
    ETag (200/400/404/409);
  - `DELETE /v1/shares/{link_id}` — soft-revoke (200/404/409);
  - `POST   /v1/shares/{link_id}/rotate-token` — mint a fresh token
    (200/404/409);
  - `POST   /v1/shares/{link_id}/extend-expiry` — push expiry forward
    (200/400/404/409);
  - `GET    /v1/shares/{link_id}/policy` (200/404);
  - `PUT    /v1/shares/{link_id}/policy` (200/400/404/409);
  - `POST   /mcp/share-introspect` — verify a signed token without
    a session (the token _is_ the credential).
    Every privileged action emits a hash-chained audit event via
    `@domio/audit-ts` (`share.created` / `share.updated` /
    `share.policy_changed` / `share.token_rotated` /
    `share.expiry_extended` / `share.deleted`). The pgx-backed
    `PgShareStore` ships with nil-guards; full DML lands in M2 once
    the migration is applied against a live Postgres. **36 tests**
    (lifecycle, concurrency, handlers, store).
- **`contracts/openapi/v1/shares.yaml`.** OpenAPI 3.1 contract for
  all 9 endpoints with request/response schemas, problem-detail
  error bodies, and capability-scope expectations.
- **Audit emission on revoke.** `share.deleted` is emitted by the
  revoke handler (the prior plan used `share.revoked`; the wire
  format kept the more standard `share.deleted`).

### Phase 12 — AI Copilot Foundation

#### Added

- **AI orchestrator (`services/ai-orchestrator`, Go).** Job lifecycle
  (`POST /v1/ai/jobs` with `Idempotency-Key` conflict handling, `GET
/v1/ai/jobs/{id}`, SSE job stream, `GET /v1/prompts/{template_id}`),
  pgx-backed `ai_job`/`ai_run` persistence, policy router (per-job cost
  cap, per-workspace cap, circuit breaker, moderation gate), generic
  planner with outline builder, executor with retries and provider
  fallback chains, and a `Broker` secrets interface (env-backed in dev
  with a Vault seam). **Planner 26 tests, renderer 22, router, executor,
  store and secretbroker suites.**
- **Model adapter layer (`packages/model-adapter`).** `ModelAdapter`
  interface (text/vision/json-mode/tools capabilities) with provider
  adapters for OpenAI, Anthropic, Google and self-hosted vLLM, dispatched
  by model-class prefix. **21 tests.**
- **Prompt registry (`packages/prompt-registry`).** Versioned, schema'd
  prompt templates seeded for all 14 Phase 12 templates (outline,
  slide design, notes, QA, summaries, translate, accessibility,
  freshness, lint). **18 tests.**
- **AI adapters service (`services/ai-adapters`).** TypeScript gRPC
  server exposing the adapter surface — GenerateText (server-stream),
  GenerateImage, Transcribe (server-stream), Embed, GetCapabilities,
  GetPrompt — as the orchestrator↔provider seam. **12 tests.**
- **AI tasks worker (`workers/ai-tasks`, Go).** NATS JetStream consumer
  for `ai.jobs.*` with AckExplicit/MaxDeliver, pgx `ai_job` transitions,
  health/ready/metrics endpoints. **13 tests.**
- **AI eval harness (`workers/ai-eval`, Python).** Golden-set runner with
  LLM-as-judge gate and seeded eval fixtures for outline and alt-text
  generation. **15 tests.**
- **Doc ingest worker (`workers/ingest-docs`, Python).** PDF (pymupdf
  with OCR hook), DOCX, Notion and Markdown extraction into `source`
  rows with chunked `ref` payloads.
- **Data-analysis worker (`workers/data-analysis`, Python).** Pearson
  correlation, Mann-Kendall trend detection, IQR/z-score outlier
  detection producing structured Findings. **38 Python tests across the
  three workers.**
- **AI contracts (`contracts/openapi/v1/ai.yaml`,
  `contracts/proto/domio/ai/v1/ai.proto`).** REST job/SSE/prompts API
  plus the gRPC seam (`AiCopilotService` + `AdapterService`), lint-clean
  against buf.
- **Migration 0039 (`infrastructure/postgres/migrations/`).** All 12 AI
  tables (source, ai_job, ai_run, citation, slide_citation,
  image_generation_request, rehearsal_session, qa_pair, summary,
  audience_variant, ai_freshness_record, semantic_index_entry) with RLS
  tenant isolation. Deferrals documented: pgvector embedding column
  (BYTEA for now, ivfflat index with the M5 follow-up), foreign keys to
  not-yet-existing phase tables, and UUIDv4 default ids vs UUIDv7.
- **Editor Copilot UI (`apps/editor/src/components/copilot/OutlineApproval.tsx`).**
  Outline approval with drag-reorder, per-slide confidence badges,
  chart-type selection and an Approve & Generate state machine; the
  `p12-store` module singleton; a Copilot sidebar tab wired into
  EditorRoot; 126 `p12.*` i18n keys across all 7 locales. **35 editor
  tests; full editor suite 386 tests.**
- **Orchestrator internals (`services/ai-orchestrator/internal/`).**
  Outline builder (template-assisted with heuristic fallback), deck
  renderer writing `deck_versions` rows with version increments and
  citation-coverage math, image moderation gate and fallback, RTL
  content transformation.

### Phase 12 completion follow-ups (closes prior M2 backlog gaps)

#### Added

- **PGX-backed DeckStore (`services/ai-orchestrator/internal/renderer/pgx_store.go`).**
  Production wiring for `deck_versions` / `slides` / `decks.current_revision`.
  Used automatically when `DATABASE_URL` is set; falls back to the
  in-memory store for dev/test. Closes phase-12 gap #2 (renderer was
  previously write-only-in-memory).
- **Slide designer (feature #111,
  `services/ai-orchestrator/internal/designer/`).** Generates 4
  distinct layout options per slide prompt with a structural
  fingerprint diversity check, fallbacks when the generator
  under-supplies, and a `MoreLike` path that produces variants
  biased toward a chosen option. HTTP: `POST /v1/ai/designer`,
  `POST /v1/ai/designer/more-like`.
- **Slide redesign (feature #112,
  `services/ai-orchestrator/internal/redesign/`).** `light` (spacing /
  alignment only) and `full` (column-grid snap) modes; brand-locked
  elements are refused at the framework boundary; content-preservation
  diff blocks any output that drifts on text / data bindings /
  citation refs. HTTP: `POST /v1/ai/redesign`.
- **Copy assistant (feature #113,
  `services/ai-orchestrator/internal/copy/`).** `shorten`, `punch_up`,
  `tone`, `translate`. Glossary lock is enforced (audit-only here;
  the transformer is expected to honor it); 100+ languages are
  represented via code-based target selection; RTL targets
  (`ar`, `he`, `ur`, `fa`, `yi`) trigger a layout-flip warning on
  output; translated runs are tagged with `translated_into` so
  re-translation is traceable. HTTP: `POST /v1/ai/copy`.
- **Image generation + bg removal (feature #114,
  `services/ai-orchestrator/internal/image/`).** Provider chain with
  deterministic fallback (`ErrAllProvidersUnavailable` with a
  client-facing `ready in N min` hint), two-layer moderation
  (orchestrator-side blocklist + provider verdict) with `Layer1Hit` /
  `Layer2Hit` flags, brand-aware style-lock prompting, and full
  provenance (sha256 hash of `provider|model|prompt` plus timestamp).
  HTTP: `POST /v1/ai/image`, `POST /v1/ai/image/{id}/remove-background`.
- **Deck render job type (HTTP).** New `type = "deck_render"` job
  accepted at `POST /v1/ai/jobs`. The router expands the payload into
  a planner outline (template-aware when the adapter is wired,
  heuristic otherwise) and persists a new deck version + slide rows
  via the pgx DeckStore. Idempotency, moderation, and circuit-breaker
  gates are inherited from the existing job flow.

### Phase 13 — M1: MCP server + read-only tools

#### Added

- **Standalone MCP service (`services/mcp-server/`, Go).** New service
  hosting the JSON-RPC 2.0 gateway for the Domio MCP tool surface.
  Listens on `:8086` by default. The gateway is the single entry point
  for all MCP traffic; the existing Node/TS `services/mcp-server/` stub
  is retained for backward compatibility but is no longer the source of
  truth.
- **JSON-RPC 2.0 gateway (`services/mcp-server/internal/gateway/`).**
  Bearer-token authentication, capability-gated dispatch via the M1
  scopes (`read:deck`, `lint:deck`, `search:deck`, `audit:read`,
  `claim:read`, `a11y:run`), RFC-7807-style problem-detail errors,
  and SSE streaming transport (reuses the pattern at
  `services/ai-orchestrator/internal/router/router.go:497-573`).
  Notifications (id=null) are accepted but never replied to.
- **Hash-chained audit log (`services/mcp-server/internal/audit/`).**
  HMAC-SHA256 per (workspace, agent_session) chain, with `prev_hash`
  linkage. `kid`-tagged keys with 7-day rotation overlap and 90-day
  hard expiry. `Build` is concurrency-safe (atomic seq assignment).
  `VerifyChain` detects tampering and reordering. Algorithms are
  byte-equivalent to `services/prototype-recorder/src/integrity.ts`
  (Phase 10 M5) so cross-service verification works.
- **Six read-only tools (features #223–#228,
  `services/mcp-server/internal/tools/`).**
  `lint_deck`, `get_provenance`, `semantic_search`,
  `get_claim_confidence`, `accessibility_audit`, `check_freshness`.
  Each tool is a pure function over JSON params with a deterministic
  stub result so the wire format is testable without a database. M2
  will back the stubs with P12 table queries.
- **PGX store (`services/mcp-server/internal/store/`).** Persists
  `mcp_session`, `mcp_tool_call`, `tool_call_idempotency`, and
  `agent_audit_event` rows. Falls back to an in-memory store when
  `DATABASE_URL` is unset. Nil-receiver and nil-pool guards on every
  method so dev-mode is safe.
- **JSON Schema contracts (`contracts/mcp/tools/*.schema.json`,
  12 files).** Every tool has an input and output schema (JSON Schema
  2020-12). All results include a `tool_version` field (`p13-m1-v1`)
  for client-side compatibility checks.
- **Migration `0040_phase13_mcp` (`infrastructure/postgres/migrations/`).**
  Creates 6 tables (`mcp_session`, `mcp_tool_call`,
  `tool_call_idempotency`, `mcp_capability_scope`,
  `mcp_tool_capability`, `agent_audit_event`) with RLS policies
  matching the P12 pattern. Seeds the 6 M1 capability scopes and
  their tool-to-scope mappings.
- **Tool registry (`services/mcp-server/internal/registry/`).**
  Goroutine-safe lookup table from method name to `Spec` (handler +
  required scopes + schema paths). `MustRegister` is used at startup
  for fail-fast configuration errors.
- **Tests.** 5 packages × ≥ 6 tests = ~50 unit + integration tests
  covering seam tests, capability gating, audit-chain integrity
  (tamper + reorder detection), id/replay safety, and an end-to-end
  JSON-RPC round-trip through the gateway.

### Phase 11 — 3D, Motion & Rich Media

#### Added

- **3D engine (`packages/3d-engine`).** Renderer core + scene/viz
  lane: capability detection (webgpu/webgl2), budget enforcement,
  LOD selection, decimation, keyframe interpolation, instanced
  rendering, particle systems, shader registry integration.
  **277 tests across the package.**
- **Scene graph & camera keyframes (`packages/3d-engine`).**
  Pure-TS scene graph, deterministic stepper, camera-keyframe
  interpolation with cubic-bezier easing, scroll-driven timeline
  with halt/wrap overshoot and reduced-motion fallback
  (`viewer/src/three/scroll-driver.ts`).
- **Audio runtime (`packages/audio`).** Mixer (computeAllGains),
  envelopes (fadeGain / duckGain / backgroundGain), drift monitor
  (withinBudget / pickDriftStrategy / updateDrift), PCM/WAV export
  bus. **Phase 11 perf smoke: 64-track bus under 10 ms, 256-track
  bus under 50 ms.**
- **Video runtime (`packages/video`).** Segment selection
  (getSegmentInfo / clipTrimToSource), WebVTT parse + generate,
  chapters, transcode state machine, contrast analyzer, waveform
  bars. **Phase 11 perf smoke: 100 KB WebVTT under 500 ms,
  64K-sample → 256 bars under 250 ms.**
- **Recording (`packages/recording`).** Frame-capture, deterministic
  scrubber, replay-diff.
- **Lottie (`packages/lottie`).** Sanitized Bodymovin playback.
- **Physics (`packages/physics`).** Rapier WASM world + pure-TS
  fallback integrator, binding-freeze registry, broadphase warning
  threshold. Viewer runtime uses the fallback for headless tests.
- **Maps (`packages/maps`).** Mapbox/MapLibre style catalog with
  sanitized style ids and zoom/clamp enforcement.
- **Agent-schema claims (`packages/agent-schema`).** Phase 11
  capability claims added: `manage_assets`, `manage_scenes`,
  `manage_policies`, `models:*`, `scenes:*`, `camera-keyframes:*`,
  `shaders:*`, `licenses:*`, `cad-jobs:*`, `ar-sessions:*`,
  `video:*`, `audio:*`, `lottie:*`, `embed-policies:*`,
  `sandbox-policies:*`, `sandbox:run`, `latex:render`,
  `map-styles:*`.
- **CAD-jobs service (`services/cad-jobs`).** In-memory repository,
  worker simulator with parsing → meshing → optimizing → done
  state machine, websocket URL builder, ULID generator, REST
  routes. **18 service tests.**
- **Embed-policy extensions (`services/embed-proxy`).**
  EmbedPolicyService CRUD, CSP header builder, focus-trap
  header, JWT verification, SSRF guard. All accessible from
  the viewer runtime.
- **MCP capability gating (`packages/mcp`).** `assertCapability`,
  `gatedHandler`, `createGatedMcpRegistry` — every Phase 11 tool
  surface (3D, media, embed, code, latex, map) goes through the
  same claim gate as the existing Phase 10 surface. **10 tests.**
- **Editor MediaPanel (`apps/editor/src/panels/media-panel.tsx`).**
  Tabbed panel for 3D Model, Video, Audio, Lottie, Embed, Code,
  LaTeX, Map. Wired into `EditorRoot` as the `m11-media` left
  tab with full `onInsert` + `onPropEdit` integration. **23 tests.**
- **License dashboard
  (`apps/editor/src/panels/license-dashboard.tsx`).** Per-workspace
  LicenseGrant summary with active / expiring / expired / revoked
  classification, seats usage, and revoke action. **9 tests.**
- **Viewer runtimes (`apps/viewer/src/`).** Phase 11 wrappers:
  - `audio/playback.ts` — gain bus + envelopes + drift over the
    `@domio/audio` primitives. **10 tests.**
  - `video/playback.ts` — segment / chapter / VTT / contrast /
    waveform wrapper. **14 tests.**
  - `physics/playback.ts` — Integrator + BindRegistry wrapper
    with broadphase warning. **10 tests.**
  - `embeds/sandbox.ts` — iframe sandbox + CSP + origin-allow
    wrapper around `@domio/embed-proxy`. **6 tests.**
  - `three/scroll-driver.ts` — scroll-driven 3D storytelling
    (M5.4) with cubic-bezier easing and reduced-motion fallback.
    **21 tests.**
  - `ar/viewer-ar.ts` — Phase 11 AR handoff runtime (M5.3):
    `detectArSupport(env)` (WebXR / iOS Quick Look / Android
    Scene Viewer probe), `buildPlatformAudienceUrl` (signed
    audience URL per platform), `createArRuntime` (lifecycle:
    enter / exit / heartbeat), `createAnchorTracker` (anchor
    attach / update / release), and `defaultArProbe` for
    headless tests. Verifies HMAC tokens minted by
    `services/ar-sessions`. **22 tests.**
- **Audio mixer wrappers (`packages/audio`).** `WebAudioMixer`
  brings the headless `computeAllGains` mixer onto a real
  `AudioContextLike` (graph construction, per-track gain/pan
  wiring, master + global volume, snapshot/restore, lifecycle
  start/stop/close). `ExportMixer` is the deterministic wrapper
  used by the recording pipeline. **18 tests using a fake
  AudioContext.**
- **Recording UI (`apps/editor/src/panels/recording-panel.tsx`).**
  M7.3 editor surface: codec pick (`selectEncoder`), adaptive
  bitrate (`computeBitrate`), resumable state machine
  (`draftReducer` + `createDraft` + `finalizeDraft`), and
  timing guards (`checkElapsed` / `checkMinDuration`). Wired
  into `EditorRoot` as the `m11-recording` left tab. **14 tests.**
- **Asset API extensions (`services/asset-api`).** M7.1 / M7.2 /
  M7.3 routes for audio, video, and Lottie assets: CRUD
  (`GET /audio`, `POST /audio`, `GET /audio/:id`, `PATCH /audio/:id`,
  `DELETE /audio/:id`, and the same for video & lottie) plus
  `POST /audio/upload` / `POST /video/upload` / `POST /lottie/upload`
  for binary content (base64-decoded). Domain types
  `AudioAsset` / `VideoAsset` / `LottieAsset`, in-memory
  repositories, and metadata parsers `parseAudioMetadata` /
  `parseVideoMetadata` / `parseLottieMetadata`. **29 new tests
  (94 total, was 65).**
- **Editor tabs.** `EditorRoot` now exposes `m11-licenses`
  (license dashboard) and `m11-recording` (recording panel)
  left tabs alongside the existing `m11-media` tab. New
  callbacks `handleInsertMedia` and the `selectedMediaKind` /
  `selectedMediaProps` derivation drive the prop-edit surface.
- **i18n.** All 7 locales now cover the `p11.*` namespace
  (60+ keys per locale): en, es, fr, de, ja, zh-CN, and the
  default fallback.
- **Perf smokes.** New files in `packages/3d-engine`,
  `packages/audio`, `packages/video` validate the Phase 11 R-11-2
  budgets with 10x wall-clock headroom.
- **CHANGELOG entry.** This section.
- **Handoff doc.** `docs/handoff/P10-to-P11.md` summarises
  deliverables, perf budgets, capability matrix, and the
  rollout plan for production.

#### Changed

- `packages/decimal128/src/arithmetic.ts` — `cmpMagnitude` return
  type narrowed to `-1 | 0 | 1` literal so `compare()` satisfies
  the existing call sites.
- `apps/editor/src/components/EditorRoot.tsx` — added `m11-media`
  leftTab case, `handleInsertMedia` callback, and `selectedMediaKind`
  / `selectedMediaProps` derivation for the prop-edit surface.
- `apps/editor/src/components/EditorRoot.tsx` — added `m11-licenses`
  (license dashboard) and `m11-recording` (recording panel) left
  tabs alongside `m11-media`, behind the same `flags.p11_rich_media`
  feature flag.
- `apps/viewer/package.json` + `apps/viewer/vitest.config.ts` —
  added `@domio/ar-sessions` dependency + alias for the new AR
  viewer runtime (`apps/viewer/src/ar/viewer-ar.ts`).
- `apps/editor/package.json` + `apps/editor/vitest.config.ts` —
  added `@domio/recording` dependency + alias for the new
  recording panel (`apps/editor/src/panels/recording-panel.tsx`).
- `services/asset-api/src/routes/audio.ts` + `video.ts` +
  `lottie.ts` — new REST route modules wired through
  `createApp()` for the audio/video/lottie asset surfaces
  (M7.1 / M7.2 / M7.3).

### Phase 10 — Prototyping & Interactivity (foundations: M1 + M2)

#### Added

- **Prototype runtime (`packages/prototype-runtime`).** Pure-TS, no-DB
  engine covering the foundations of Phase 10:
  - Safe expression compiler (`compileExpression`) — AST whitelist,
    rejects `eval`/`Function`/dynamic access/`this`/`arguments`,
    adapter over `@domio/formula-engine` so there is a single sandbox.
  - Typed VarStore (viewer → session → component_instance → slide →
    deck scope chain) with `Object.is` change detection, snapshot/
    restore, and typed subscriptions.
  - BindingsDAG with topological propagation, cycle detection at
    registration, ≤ 0.5 ms p99 per variable read budget.
  - RuleEvaluator — priority + short-circuit ordering, returning
    `{ ruleId, action }` for the first matching `ConditionalRule`.
  - ActionExecutor — `show | hide | enable | disable | set_variable |
navigate_to | play_animation | open_overlay | close_overlay |
submit_form` dispatched through a single `dispatch(action, ctx)`.
  - BranchingGraph — adjacency list, Tarjan SCC cycle detection,
    bounded DFS with `DEFAULT_MAX_HOPS = 100`, returns
    `{ hasCycle, cycles, unreachable, islands, multiStart }`.
  - Hotspot hit-test — normalized `[0..1]` geometry, LRU cache per
    slide, z-index aware.
  - OverlayStack — z-stack with `max_depth = 5`, last-opened-on-top,
    focus-trap helpers.
  - **124 tests across the package.**
- **Prototype-runtime service (`services/prototype-runtime`).** Hono
  CRUD for hotspots, overlays, branching edges, interaction states,
  variables, variable bindings, and conditional rules. Web-framework-
  free handlers with the canonical four-line tenant pattern;
  optimistic-lock 409 via `currentVersion` in the response body; in-
  memory repositories + Postgres DAL interface. **39 service tests.**
- **Canvas ops (`packages/canvas`).** Six new history ops for the
  prototype surface, each with forward/inverse factory and
  `applyOp` wiring:
  `HotspotOp`, `OverlayOp`, `BranchingEdgeOp`, `VariableOp`,
  `ConditionalRuleOp`, `VariableBindingOp`. Stored at
  `slide['x-domio:hotspots']`, `slide['x-domio:overlays']`,
  `slide['x-domio:branching-edges']`, `slide['x-domio:variables']`,
  `props['x-domio:conditional-rule']`, `props['x-domio:variable-binding']`.
  **63 op tests (25 new + 38 existing).**
- **Editor UI (`apps/editor`).** Two new left-side tabs:
  - **Connections panel** — four sub-tabs (Hotspots, Branching,
    Overlays, Graph); add/remove hotspots wired to a slide, branching
    edges wired to a target slide + optional rule id, overlay CRUD,
    and a one-click graph validator showing
    `Has cycle: yes/no`, unreachable count, islands, multi-start.
  - **Variables panel** — two sub-tabs (Variables, Rules); variable
    CRUD (scope + type pickers, parsed numeric defaults), rule CRUD
    (priority, action picker), and an inline "Test rule" preview
    button that compiles the expression and evaluates it against the
    current VarStore snapshot. Compile errors render in the panel.
  - Both panels live under the new `p10-connections-tab` /
    `p10-variables-tab` side tabs and commit every change via the new
    prototype ops through the HistoryEngine (undo/redo safe).
  - **22 component tests + 9 Playwright e2e.**
- **Contracts.** 7 JSON Schemas (hotspot, overlay, branching-edge,
  interaction-state, variable, variable-binding, conditional-rule) and
  4 OpenAPI 3.1.0 yamls (prototype-hotspots, prototype-overlays,
  prototype-variables, prototype-rules). Bearer auth, `tenant_id`
  required query, `operationId` per endpoint.
- **Migrations.** `0025_phase10_prototyping` (7 tables + RLS via
  `current_setting('app.tenant_id', true)` PL/pgSQL block) and
  `0026_phase10_prototyping_indexes_seed` (gin(geometry) on hotspots,
  gin(state_machine) on interaction_states, conditional_rules priority
  index, seed hotspots + overlays for the `system` tenant). Migration
  harness extended with a P10 block — **7/7 green.**

### Phase 10 — Prototyping & Interactivity (M3: Component state machines)

#### Added

- **Prototype runtime (`packages/prototype-runtime/src/state-machines/`)**:
  - `StateMachine` — finite-state machine driver with `transition(kind)`,
    `transitionBatch(events)`, `reset`, `transitionsFrom`, `graphRows`.
    Validation throws on empty states / unknown initial / bad transitions;
    emits `fireTransition` events through the bus.
  - `TransitionEvaluator` — resolves same-tick ambiguous events via the
    precedence ladder `focus > press > click > hover > default`.
  - `EventBus` — stable bound handler, `onTransition` / `emit` /
    `lastEvent` / `clear`.
  - `StateScope` — `attach(instanceId, machine)`, scope-aware
    `setPersistInstanceState`, `resetOnSlideEnter`, `snapshot` /
    `restore` for `session | slide | deck | persistent_session`.
  - **54 new tests** in `state-machines/*.test.ts`.
- **Prototype-runtime service (`services/prototype-runtime/src/`)**:
  - `createInteractionState` now accepts the canonical
    `{ states, transitions, initial }` JSONB spec via
    `CreateInteractionStateInput`.
  - New handlers: `getInteractionState`, `patchInteractionState`,
    `deleteInteractionState`, `transitionInteractionState`
    (uses the runtime `StateMachine` end-to-end and returns
    `TransitionResult` with previous / current / changed / precedence).
  - DAL `findByInstance(instanceId)` on the in-memory repository.
  - **12 new service tests** (51 total, was 39).
- **Contracts**:
  - `contracts/schema/v1/state-machine-v1.schema.json` — JSON Schema
    2020-12, `additionalProperties: false`, `states` is an object map
    of `{label?, meta?}` nodes, `transitions` array of
    `{from, to, event, guard?}` (max 256), `initial` references a
    state name, precedence ladder documented on `event-name`.
  - `contracts/openapi/v1/prototype-state-machines.yaml` — OpenAPI
    3.1.0, bearer auth, `tenant_id` required query, list/get/create/
    patch/delete + `POST .../transition` returning
    `{record, transition}`.
- **Editor panel (`apps/editor/src/panels/state-inspector-panel.tsx`)**:
  BEM classnames, `m3-` testid prefix; add-machine form, machine list
  with remove + persist toggle, transition graph sorted by runtime
  precedence, pause-and-inspect toggle that disables the apply-event
  button. Mounted in `EditorRoot` as the `state-inspector` left-side
  tab. **12 panel tests.**
- **Editor e2e** (`apps/editor/e2e/p10-m3-state-machines.spec.ts`):
  6 Playwright smoke tests covering open / form fields / add /
  transition graph / pause / remove / persist.
- **Postgres migration**
  `infrastructure/postgres/migrations/0027_phase10_state_machines.{up,down}.sql`:
  adds `interaction_state.persist_instance_state boolean NOT NULL DEFAULT false`,
  `interaction_state_instance_idx` on
  `(tenant_id, deck_id, instance_id)`, and a partial
  `interaction_state_persist_idx` for the persistence flag slice.
  Migration harness extended with a P10-M3 block (apply / columns /
  indexes / round-trip / scope check / rollback).

#### Deferred to follow-on phases (see `docs/handoff/P09-to-P10.md`)

- M4 — Forms, calculators, device frames (landed — see M4 section below).
- M5 — Prototype user-testing telemetry recorder (landed — see M5 section below).
- M6 — Quizzes + auto-advance (landed — see M6 section below).
- M7 — Deep-link state codec (landed — see M7 section below).
- M8 — MCP agent surface for prototyping tools (landed — see M8 section below).
- Viewer-side hotspot/overlay/form/calculator renderers.
- CRDT sub-documents for prototype-runtime (deferred until viewer/
  runtime matures).
- xAPI / SCORM LRS adapter.
- BullMQ workers (project uses poll-loop pattern per P09 precedent).

### Phase 9 — Animation & transition system

#### Added

- **Easing library (`packages/easing`).** Pure-TS, fully deterministic
  easing evaluators (linear, step, cubic-Bézier via Newton-Raphson with
  degenerate fallbacks, spring via fixed 120 Hz sub-step solver with
  `wobbly`/`snappy`/`gentle` presets, physics gravity/throw/bounce);
  `validateBezier` rejecting degenerate/non-monotonic/out-of-range handles;
  256-entry LUT builder (<5 ms) + 1024-entry LRU cache. **47 tests.**
- **Animation runtime (`packages/animation-runtime`).** Client timeline
  engine (tracks, keyframes, interpolation of numbers/colors/strings,
  loop/playCount/startOffset, debounced writes, worker-offload hook,
  headless `tickManually`); trigger resolver (`on_click`/`on_enter`/
  `on_hover`/`on_data_change`/`on_timer` with 250 ms debounce + 16-trigger
  cap, negative timer offset rejected); stagger (forward/reverse/
  center-out/random, offsets only); reduced-motion guard (`follow_os`/
  `always_reduced`/`always_full`, duration clamp, particle/scroll collapse);
  scroll-linked bindings (32 cap, dependency rejection). **77 tests incl.
  a 64-track @ 60 fps perf smoke.**
- **Timeline API (`services/timeline-api`).** Hono service: timeline/track/
  keyframe/trigger CRUD with optimistic-lock (etag → 409), easing-curve
  CRUD with business-rule validation (non-monotonic Bézier, spring bounds),
  animation-preset CRUD with `applyPreset` (required-property check +
  last-slide `on_enter`→`on_click` conversion), transition CRUD, reduced-
  motion get/put (default `follow_os`). **33 tests.**
- **Magic-move (`services/magic-move` + `workers/magic-move`).** Job CRUD
  - worker-facing claim/complete/fail; compute worker with poll loop and
    graceful shutdown. **19 tests.**
- **Export pipeline (`services/export-pipeline` + `workers/export-render`).**
  Job lifecycle (queued→rendering→encoding→ready) with budget enforcement
  (GIF ≤ 12 s, video ≤ 30 s); GIF encoder via gifenc with a minimal
  GIF89a LZW fallback; ffmpeg shell-out for MP4/WebM (graceful
  `{ unsupported: true }` when absent); SSRF guard (loopback, RFC1918,
  link-local, cloud metadata, non-HTTPS); render worker with graceful
  shutdown. **54 tests.**
- **Viewer animation runtime (`apps/viewer/src/animation`).** Scroll-linked
  resolver (easing, bucket cache, cap, dependency chain), reduced-motion
  guard factory, playback engine over `TimelineEngine`, 8-kind transition
  resolver (fade/slide/wipe/zoom/flip/bubble/cube/shutter) with motion-heavy
  classification; interactive demo page wiring all four modules. **87 tests.**
- **Canvas ops (`packages/canvas`).** `TimelineOp`, `TransitionOp`,
  `MagicMoveOp`, `ReducedMotionOp` (deep-clone + inverse-swap factories,
  apply/revert, `applyOp` wiring) storing to
  `props['x-domio:timeline']` / `slide['x-domio:transition']` /
  `element.element_role` / `deck['x-domio:reduced-motion']`. **188 tests.**
- **Editor UI (`apps/editor`).** Animations left tab with timeline panel
  (add/configure timelines, tracks, keyframes, play/scrub), easing picker +
  custom Bézier editor, trigger picker, per-slide transition inspector,
  magic-move role inspector, copy/paste animations, reduced-motion policy
  panel, export dialog; all committed via the new ops through the
  HistoryEngine (undo/redo safe). **189 tests + 9-test Playwright e2e.**
- **Scene-graph `element_role`.** Optional `element_role` field added to all
  layer types (contract-first: schema → generated types → validator test).
- **Contracts + migrations.** 7 JSON schemas (timeline, easing-curve,
  animation-preset, reduced-motion, magic-move, transition, animation-export)
  - 5 OpenAPI yamls (animation, magic-move, export-pipeline); migrations
    `0023_phase09_animation` (10 tables + RLS) and
    `0024_phase09_animation_indexes_seed` (indexes + easing curves + 24
    presets), verified against live Postgres via the docker-gated harness
    (7/7).

### Phase 8 — Live data & interactive charts

#### Added

- **Formula engine (`packages/formula-engine`).** Recursive-descent parser
  (lexer → AST) for spreadsheet-style formulas; ~50 built-in functions
  (aggregation, logical, text, date, lookup, math) with typed error codes
  (`#DIV/0!`, `#REF!`, `#CYCLE!`, `#NAME?`, …); dependency DAG with
  cycle detection reporting the reachable path; incremental recompute
  (slider drags re-evaluate only dependents); constant folding + CSE;
  sandboxed evaluator with host-access rejection (`eval`, `Function`,
  `globalThis`, `process`, `fetch`, …) and step/recursion/runtime caps —
  no `eval`, no I/O. **288 tests.**
- **Chart engine (`packages/chart`).** 14 chart types (bar, line, area,
  pie, scatter, funnel, sankey, treemap, heatmap, waterfall, gauge,
  radar, candlestick, bullet) rendered as SVG with a tri-stack renderer
  interface and hybrid escalation thresholds (1k / 10k points);
  per-type binding schemas + `validateBinding`; interaction layer
  (hit-test, drill, legend toggle, brush zoom); data-table ops
  (sort, paginate >10k with cursor, locale-aware format,
  conditional format, sparkline). **84 tests.**
- **Mock data generator (`packages/mock-data`).** Seeded deterministic
  generator (uniform/normal/lognormal/poisson/categorical/date/currency)
  with correlated region/quarter demos. **26 tests.**
- **Connector framework (`services/connector-framework`).** Versioned
  adapter registry (pin/deprecation); canonical column/row normalization
  with semantic roles; PII shape detection (email/phone/SSN) reusing
  `@domio/redact-pii`; exponential backoff + jitter + circuit breaker;
  auth flow handlers for Google/Microsoft/Airtable/Notion (state + scope,
  CSRF); credential validation for Postgres/MySQL/BigQuery/Snowflake +
  REST/GraphQL (bearer/API-key/anonymous); `create-readonly-role` SQL for
  Postgres 14+ and MySQL 8; 10 adapters (sheets, excel, airtable, notion,
  postgres, mysql, bigquery, snowflake, rest, graphql) on an injectable
  transport with recorded-provider fixtures (real Postgres adapter is
  docker-gated). **126 tests.**
- **Query gateway (`services/query-gateway`).** Token-bucket rate limiter
  (burst + refill), 3-tier cache with single-flight stampede prevention,
  ACL (deny-by-default), HMAC webhook ingestion with idempotent dedup,
  single-use viewer tokens with TTL + scope, append-only tamper-evident
  audit log. **33 tests.**
- **Refresh scheduler (`workers/refresh-scheduler`).** Drift-tracked
  `on_interval` ticking (≤1s) + `eager` triggers; writes
  `dataset_snapshot` + `freshness_record` (ok/error). **14 tests.**
- **Scenario manager (`services/scenario-manager`).** Scenario DAG
  (parent chains, cycle detection with reachable path, depth cap 8),
  overlay merge (parent-first, child-wins) + diff, CRUD + REST. **28 tests.**
- **Localization (`services/localization`).** Intl number/currency/percent/
  date formatting + collation (en/de/bn), fixed-point Decimal arithmetic
  (no float drift), FX rate ingestion + as-of conversion. **32 tests.**
- **Embed proxy (`services/embed-proxy`).** SSRF guard (loopback, RFC1918,
  link-local, cloud metadata, DNS re-check), single-use TTL embed tokens,
  authenticated forwarding. **61 tests.**
- **Freshness tracker (`workers/freshness-tracker`).** Append-only
  freshness records (ok/stale/error/never), staleness math with grace
  period, graceful shutdown. **25 tests.**
- **Contracts.** JSON Schemas `chart-binding-v1`, `scenario-v1`,
  `annotation-v1`, `query-v1`, `threshold-rule-v1`, `mock-data-v1`;
  OpenAPI `connector-framework.yaml`, `query-gateway.yaml`, `scenario.yaml`,
  `localization.yaml`, `embed-proxy.yaml`, `freshness-tracker.yaml`.
- **Migrations.** `0021_phase08_data_plane` (12 tables + RLS via
  `current_setting('app.tenant_id')`) and `0022_phase08_live_data_indexes_seed`
  (indexes + 4 freshness policies + 24 threshold-rule templates).
- **Canvas ops (`packages/canvas`).** `DataBindingOp` / `ThresholdOp` —
  bindings and threshold rules persist on the layer via
  `props['x-domio:binding']` / `props['x-domio:thresholds']` with
  deep-cloned inverse for undo. **10 tests.**
- **Prop engine (`packages/schema-prop`).** Real `data-binding` and
  `thresholds` control kinds (previously a placeholder). **8 tests.**
- **Editor live-data UI (`apps/editor`).** Data Sources tab (demo
  datasets + add/refresh/remove), live-chart inserts (14 types via
  `domio.live-*` catalog), bind-to-data inspector with field mapping and
  validation, threshold rules panel, scenario switcher dropdown,
  freshness status, stage-view toggle. **153 tests (26 files)** +
  e2e smoke `e2e/p08-live-charts.spec.ts` (insert → bind → threshold →
  scenario). **242 tests** in `@domio/components`.
- **Handoff doc:** `docs/handoff/P07-to-P08.md`.

### Phase 0 — Repository, contracts, dev environment

#### Added

- Monorepo scaffolding (pnpm workspaces + Turborepo).
- Toolchain pinning via `.tool-versions` (asdf).
- Wire-format contracts:
  - `contracts/proto/domio/v1/common.proto` — `ResourceId`, `Money`, `Error`, `IdempotencyKey`, `AuditActor`.
  - `contracts/proto/domio/v1/health.proto` — `HealthzService`, `ReadinessService`.
  - `contracts/proto/domio/v1/deck.proto` — placeholder deck surface.
  - `contracts/openapi/v1/common.yaml` — health, ready, error, pagination.
  - `contracts/openapi/v1/decks.yaml` — placeholder deck REST surface.
  - `contracts/schema/v1/common.schema.json` — JSON Schema for `ResourceId`, `Money`, `Error`, `AuditActor`.
  - `contracts/schema/v1/deck-placeholder.schema.json` — placeholder.
- Buf-managed Protobuf with `buf format`, `buf lint`, `buf breaking` rules.
- Local infrastructure (docker-compose): Postgres 16, Redis 7, NATS JetStream, MinIO, ClickHouse, OpenSearch, MailHog, Prometheus, Grafana, Jaeger, OTel collector.
- `@domio/common` package — IDs, time, money, errors, idempotency, types.
- `@domio/api` — Hono on Node 22, `/healthz`, `/readyz`, placeholders root + deck.
- `@domio/editor` — Next.js 15 stub.
- `@domio/viewer`, `@domio/presenter`, `@domio/landing` — Next.js stubs.
- Stub packages for every planned capability (canvas, ui, tokens, crdt, chart, media-runtime, prototype-runtime, formula-engine, ai-sdk, agent-sdk, analytics-sdk, mcp, engine-sdk).
- Stub services for every planned long-running server (realtime-gateway, registry, theme, brand, data, ai-orchestrator, mcp-server, publish, audience, analytics, collab, audit).
- Stub workers for every planned batch / queue service (connectors, render, brand-extract, theme-pair, ai-eval, export, snapshot, op-writer, analytics-rollup).
- ESLint flat config (with TypeScript).
- Prettier config and ignore rules.
- Pre-commit hooks (prettier, actionlint, shellcheck, buf, secrets).
- GitHub Actions: contracts, TypeScript matrix, Go, Rust, Python, security, container build.
- GitHub Actions: release workflow.
- GitHub PR template, issue templates (feature, bug).
- `CODEOWNERS` mapping every directory to a team.
- Devcontainer for VS Code.
- Dockerfile for the API (multi-stage, non-root, distroless-friendly).
- Three ADRs:
  - `0001-monorepo` — adopt a single monorepo with polyglot toolchains.
  - `0002-polyglot` — adopt a polyglot backend with a non-negotiable contract rule.
  - `0003-contract-first` — contract-first wire formats with generated clients committed.
- Runbook template + first runbook (RB-001: local dev stack reset).
- `bin/` scripts: `bootstrap`, `dev-up`, `dev-down`, `dev`, `dev-logs`, `db-migrate`, `gen`, `lint`, `test`, `clean`.
- `scripts/scaffold-stubs.sh` — regenerate stub packages/services/workers.
- README, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, LICENSE.

#### Notes

- No business logic ships in Phase 0. The next phase (Phase 01) wires
  observability, CI/CD, and the production-grade infra baseline.
- All wire-format contracts are versioned. Backwards-incompatible
  changes require an ADR.

### Phase 6 — Components & Templates ecosystem

#### Added

- **Component ecosystem core (sub-phase 1):** `component` scene-graph kind + validation;
  `@domio/schema-prop` JSON-Schema 2020-12 prop engine (Fast-Check tested);
  `@domio/components` curated catalog (25 components incl. `domio.icon`); `PropEditOp`/
  `VariantChangeOp` CRDT ops; `ElementSvg` renderer upgrade; Magic UI chrome
  (Tailwind + `motion`, adapted `MagicCard` + `Marquee`); Insert → Components panel,
  schema-driven PropsPanel, promote dialog, My Library, Stickers, Icon picker.
- **Registry service (`services/registry`, Hono):** content-addressed bundle store with
  SHA-256 hash verification, signed URLs (5-min TTL), catalog (publish/get/search/deprecate),
  variant resolution (instance > matrix > master), version pins (track-latest/pin-version/
  pin-range/workspace-managed), install round-trip, license module (compact JWS grant/verify,
  30-day offline grace, seats, revocation), team libraries (append-only event log, idempotent
  replay, policy modes, HMAC webhooks), marketplace (listing lifecycle state machine, reviews +
  moderation pipeline, append-only revenue-share ledger, read-side search), templates (install
  engine with binding-path placeholders, section templates, brand-lock enforcement in 3
  strictness modes, SVG poster/preview renderer), media (icon ingest + trigram/dhash search +
  recolor, Unsplash/Pexels stock providers, Lottie validation/sanitization + GIF budget,
  sticker packs), workers (library-sync, license-signer, payout-ledger-writer, review-moderator,
  template-preview-renderer, icon-importer, cdn-signer), HTTP transport (7 route groups) and
  MCP tool surface (13 tools + agent audit trail). **542 tests, 84% line coverage.**
- **Contracts + data:** `component-package-v1` and `marketplace-listing-v1` JSON schemas,
  7 protos (component_registry, marketplace, license, library_sync, templates, locks,
  mcp_components), migrations 0011–0016 (catalog, libraries, marketplace+license+ledger,
  templates+brand-locks, icons, blobs+audit) — apply/rollback verified against Postgres;
  ADRs 0005–0008 (prop schema, bundle store, license, brand locks).
- **Editor flows (sub-phase 2):** promote-to-component with prop inference, detach-from-
  component, version pinning + update/unavailable badges, sticker packs, icon picker with
  recolor, i18n (en/bn/es/fr/de/ja/zh-CN), axe-core a11y gates, Playwright E2E smoke.
- **Fixed pre-existing editor build blockers:** `next.config.mjs` webpack `extensionAlias`
  for `.js`→`.ts` workspace imports; split `loadContracts` into `@domio/schema/contracts`
  subpath so the schema barrel is client-bundle safe.

#### Fixed

- Editor `HistoryEngine` was recreated per deck state via
  `useMemo([deck])`, silently wiping undo/redo history after every op;
  now constructed once.
- Pre-existing ESLint `consistent-type-imports` violations across
  editor sync files.

### Phase 7 — Theming, Brand & Design Tokens

#### Added

- **Design token substrate (`@domio/tokens`, `@domio/theme`).** Typed token
  schema (color, typography, spacing, radius, shadow, motion, content,
  border); pure-function sRGB ↔ OKLCH conversions; WCAG 2 contrast and
  APCA Lc helpers; alias-cycle detection; referrer finder; theme-diff
  computation; inheritance chain inspection.
- **Theme service (`services/theme`).** Token / theme / override CRUD;
  transactional theme apply with audit; published theme versions are
  immutable. **32 tests.**
- **Brand service (`services/brand`).** Brand-kit CRUD with logos,
  palettes, type system, imagery rules; immutable published form;
  sub-brand DAG with cycle detection; multi-brand contexts;
  URL-driven extraction job record with `attribution` block and
  mandatory `extractionAttestation`. **41 tests.**
- **Font service (`services/font`).** `.woff2/.woff/.otf/.ttf/.ttc`
  upload with SHA-256 dedup, license-status inference
  (`permissive | restricted | unknown`), glyph-coverage reporting per
  Unicode block, anti-piracy heuristic gating (score ≥ 0.8 throws
  `FontLicenseBlockedError`). **21 tests.**
- **Style lint service (`services/lint`).** Two-pass engine; rules for
  off-brand color (BLOCK), off-brand font (WARN), off-token spacing
  (INFO), low contrast (BLOCK via WCAG), alias loops (BLOCK); structured
  `fixProposal` payloads (replacementToken, deltaE, old/new values)
  for one-click apply. **18 tests.**
- **Dark/light pair worker (`workers/theme-pair`).** OKLCH lightness
  remap, chroma compensation (Helmholtz-Kohlrausch), hue preservation
  ±10°, gamutmapping, grey fallback for low-chroma colors. **7 tests.**
- **Brand extraction worker (`workers/brand-extract`).** URL → brand
  kit with attribution block; color/font/logo/attribution helpers;
  `color.brand.*` token-ID suggestion. **8 tests.**
- **Accessibility audit worker (`workers/accessibility-audit`).** WCAG
  (AA 4.5:1 / AA-Large 3:1 / AAA 7:1), APCA (Lc ≥ 60),
  Brettel/Vienot/Mollon dichromacy matrices, ≥ 30° OKLCH palette
  suggestion; decorative tokens never block. **12 tests.**
- **Marketplace preview service (`services/marketplace-preview`).**
  Listing lifecycle (`draft | published | archived`) with canonical
  SHA-256 content-hash verification on install; license-bundle
  enforcement (restricted assets require admin override); a11y
  certification gate; opt-in buyer sample reviews; install always
  materializes a brand-kit draft and never auto-applies to existing
  decks. **18 tests.**
- **Brand-aware MCP tools (`services/mcp-server/src/brand-tools.ts`).**
  `apply_theme`, `token.audit_a11y`, `theme.suggest_palette` with
  brand-context scope enforcement (`BRAND_SCOPE_VIOLATION` when an
  agent scoped to Brand A touches Brand B). **9 tests.**
- **Editor Theme & Brand panel (`apps/editor`).** Left-side panel
  providing theme picker, brand-kit picker, dark/light scheme toggle,
  per-slide palette override, and a11y audit affordance; persists
  through the autosave facade
  (`theme.applied`, `theme.override_set`, `theme.color_scheme_changed`,
  `brand.context_changed`). **7 new tests; editor 122/122 passing.**
- **Handoff doc:** `docs/handoff/P06-to-P07.md` documents the P06 →
  P07 contracts, surfaces, metrics, and deferred-by-design items.
- **Contracts:** `design-token-v1`, `brand-kit-v1`, `font-asset-v1`
  schemas; `theme.proto`, `brand.proto`, `font.proto`, `lint.proto`;
  `theme.yaml`, `brand.yaml`, `font.yaml`, `lint.yaml`.

### Phase 10 — Prototyping & Interactivity (M6: Quizzes + Auto-Advance)

#### Added

- **Quiz runtime (`packages/prototype-runtime/src/quizzes`):**
  - `QuizRuntime` — `start(quiz, seed)` (deterministic question
    order via Mulberry32 FNV-1a hash → PRNG), `answer(qId, value)`,
    `score()`, `attempts()`, `complete()` (cached & idempotent),
    supports all 9 question types.
  - `XapiEmitter` — produces xAPI 1.0.3 statements
    (`experienced`, `answered`, `completed` + `passed/failed`)
    replayable by Yet Analytics SCORM Cloud.
  - 9 question-type validators under `quizzes/question-types/` —
    `multiple-choice`, `multi-select` (set equality with 0.5 partial
    credit), `true-false`, `short-answer` (Levenshtein similarity,
    default 0.85 typo tolerance, case-insensitive), `fill-blank`,
    `drag-to-match` (keyboard-only a11y, left→right mapping),
    `hotspot-quiz` (point-in-polygon + centroid distance, default
    tolerance 0.04, partial credit between tolerance and 2×tolerance),
    `flash-card` (known=1, unknown=0.5), `short-answer-llm` (async
    grader with `DEFAULT_LLM_FALLBACK_THRESHOLD = 0.7` flipping the
    answer into the LLM-review queue via `needsHumanReview`).
- **Sequence runtime (`packages/prototype-runtime/src/sequences`):**
  - `TimelineRuntime` — `start()`, `pause()`, `resume()` (accumulates
    `pausedTotalMs`), `tick(deltaMs)`, `currentSlide()`,
    `pausedTotalMs()`, `completedPlays()`, `isAborted()`,
    `flagPauseProgress(ms)` (fires `onWarn` once at `pauseWarnAtMs`,
    default 30 min), `interrupt({kind, slideId, at})`. Honors
    `intervalMs`, `pauseOnEvent`, `loop`, `count`,
    `interruptionPolicy` (ignore / queue / abort),
    `reducedMotionDefaultOff`, and `pauseWarnAtMs`. `DEFAULT_PAUSE_WARN_AT_MS = 30 * 60 * 1000`.
  - `interruption-policy.ts` — pure-function state machine
    `applyInterruption`, `dequeueInterruption`, `initialInterruptionState`.
  - `visibility-listener.ts` — drives pause/resume off
    `document.visibilitychange`, handling tab-backgrounded clock
    drift without advancing the timeline while hidden.
  - **No-touch on substrate**: extends phase-runtime exports; no
    changes to `BindingsDAG` or `RuleEvaluator`.
- **Prototype runtime service M6 endpoints** — six new
  repositories (`QuizRepository`, `QuizAttemptRepository`,
  `QuizAnswerRepository`, `QuizResultRepository`,
  `LlmReviewQueueRepository`, `PresentationSequenceRepository`)
  with full in-memory implementations. New handlers:
  - `POST /v1/decks/:deck/quizzes` (create),
    `GET /v1/decks/:deck/quizzes` (list),
    `GET /v1/quizzes/:id`, `PATCH /v1/quizzes/:id` (with version
    locking), `DELETE /v1/quizzes/:id`.
  - `POST /v1/decks/:deck/quizzes/:quiz/attempts` (start attempt,
    seeded viewer id), `POST /v1/quiz-attempts/:attempt/answers`
    (submit answer — enqueues to LLM review queue on
    `needsHumanReview`), `POST /v1/quiz-attempts/:attempt/complete`
    (finalize result), `GET /v1/quiz-attempts/:attempt` (result).
  - `GET /v1/llm-review-queue?status=pending|in_review|resolved`,
    `PATCH /v1/llm-review-queue/:id` (approve / reject / override).
  - `POST /v1/decks/:deck/presentation-sequences`,
    `GET /v1/decks/:deck/presentation-sequences`,
    `GET /v1/presentation-sequences/:id`,
    `PATCH /v1/presentation-sequences/:id`,
    `DELETE /v1/presentation-sequences/:id`.
  - New schema validators (`validateCreateQuiz`,
    `validatePatchQuiz`, `validateQuizAnswer`,
    `validateStartAttempt`, `validateLlmReviewUpdate`,
    `validateCreatePresentationSequence`,
    `validatePatchPresentationSequence`) with proper enums for
    question types and interruption policies.
- **Editor panels** (`apps/editor/src/panels/`):
  - `quiz-panel.tsx` — author + edit quiz with 9-type question
    picker, prompt editor, passThreshold control, optimistic
    version bumping. data-testid `m6-quiz-*`.
  - `leaderboard-panel.tsx` — review pending LLM-grade items with
    approve / reject / override actions plus per-quiz aggregate
    stats. data-testid `m6-leaderboard-*`.
  - `sequence-inspector-panel.tsx` — configure timeline + per-slide
    ordering + interruption policy + pause-warn threshold + reduced
    motion default-off. data-testid `m6-sequence-*`.
  - Mounted in `EditorRoot` as tabs `m6-quizzes-tab`,
    `m6-leaderboard-tab`, `m6-sequence-tab`.
- **Postgres migrations** (`infrastructure/postgres/migrations/`):
  - `0032_phase10_quizzes.{up,down}.sql` — `quiz`, `quiz_attempt`,
    `quiz_answer`, `quiz_result`, `llm_review_queue` tables +
    lookup indexes (`quiz_deck_idx`, `quiz_attempt_quiz_idx`,
    `quiz_attempt_viewer_idx`, `quiz_answer_attempt_idx`,
    partial index `llm_review_queue_status_idx`) + tenant-isolation
    RLS on every table.
  - `0033_phase10_sequences.{up,down}.sql` — `presentation_sequence`
    - deck index + tenant-isolation RLS, with enum CHECK on
      `interruption_policy` (`ignore | queue | abort`).
  - Migration harness extended with `P10-M6.1` + `P10-M6.2` blocks
    (`tools/infra-test/src/postgres/migrations.spec.ts`).
- **Contracts**:
  - `contracts/schema/v1/quiz-v1.schema.json` — 9-type question schema.
  - `contracts/schema/v1/xapi-statement-v1.schema.json` — xAPI 1.0.3.
  - `contracts/schema/v1/presentation-sequence-v1.schema.json`.
  - `contracts/openapi/v1/prototype-quizzes.yaml` +
    `contracts/openapi/v1/prototype-sequences.yaml`.
- **Tests** — 308 prototype-runtime package tests (M6.1 quiz: 56,
  M6.2 sequence: 19, plus earlier M1-M3 + M7 work); 69 prototype-runtime-
  service tests covering quiz + sequence CRUD + attempt lifecycle;
  25 new panel tests (quiz + leaderboard + sequence); 9 e2e
  tests (`p10-m6-quizzes.spec.ts`, `p10-m6-sequences.spec.ts`).
- **Handoff doc** — `docs/handoff/P09-to-P10.md` updated to remove
  M6 from the deferred list and document the landed deliverables.
- **TypeScript strict + `exactOptionalPropertyTypes: true`** held
  throughout — no `any`, no `as unknown`.

### Phase 10 — Prototyping & Interactivity (M7: Deep-Link State Codec)

#### Added

- **Codec package (`packages/deep-link`).** Pure-TS deep-link
  state codec with HMAC-SHA256 signing over canonical JSON:
  - `state-encoder.ts` — `encodePayload`, `decodePayload`,
    `canonicalJson`, `generateKey`, and `StateEncoder`/`StateDecoder`
    classes. `decodePayload` uses `timingSafeEqual` and strictly
    enforces required fields, wire version (`DEEP_LINK_VERSION = 1`),
    audience match, and expiry. **≤ 5 ms decode p99 across 200
    samples verified by test.**
  - `shortener.ts` — 9-char Crockford short-id, replay-safe
    `Shortener.resolve()` enforces single-use via the
    `click_count > 1 && before.click_count >= 1` predicate.
  - `key-rotation.ts` — `KeyRotator` with `KEY_TTL_MS = 30d`,
    `OVERLAP_MS = 7d`, `RETIRE_AFTER_MS = 37d`. Active key signs
    new tokens; previous key stays valid for resolution during the
    overlap window and is swept after retirement.
  - `scope-filter.ts` — strips `server_only` entries before signing,
    strips `private` unless authoring === requesting, strips
    `session`/`viewer` scope for public links or mismatched
    viewers.
  - **41 tests across the package** (state-encoder 18, shortener 8,
    key-rotation 7, scope-filter 8).
- **Deep-link service (`services/deep-link-svc`).** Hono CRUD
  with web-framework-free handlers:
  - `POST /v1/tenants/:tenant/decks/:deck/deep-links/shorten`
  - `POST /v1/tenants/:tenant/deep-links/resolve`
  - `DELETE /v1/tenants/:tenant/deep-links/:id`
  - `GET /v1/tenants/:tenant/deep-links/:id/stats`
  - `GET /v1/tenants/:tenant/decks/:deck/deep-links`
  - `POST /v1/tenants/:tenant/decks/:deck/deep-links/rotate-key`
  - `DeepLinkService` facade composes `Shortener` + `KeyRotator`
    and enforces tenant scoping on every operation.
  - **17 service tests** covering shorten, resolve, audience
    mismatch, expiry, single-use, scope filter, key rotation
    overlap, and the four HTTP error paths.
- **Postgres:** `0034_phase10_deep_links.{up,down}.sql` adds the
  `deep_links` table (`id`, `tenant_id`, `deck_id`, `kid`,
  `payload` jsonb, `click_count`, `expires_at`, `viewer_scope`
  CHECK, `single_use`, `created_at`, `created_by`), the
  `deep_links_deck_idx` and `deep_links_tenant_expiry_idx`
  indexes, and the `deep_links_tenant_isolation` RLS policy via
  PL/pgSQL mirroring 0025/0021/0023. A `system`-tenant demo row
  is seeded for harness verification.
- **Migration harness:** `tools/infra-test/src/postgres/migrations.spec.ts`
  P10-M7 block — 7 tests covering apply, columns/types, indexes,
  CHECK constraint, RLS policy, round-trip insert, and rollback.
  **All 51 migration harness tests green.**
- **Contracts:**
  - `contracts/schema/v1/deep-link-payload-v1.schema.json` (wire
    payload with const `v: 1`, ULID patterns, `additionalProperties:
false`).
  - `contracts/schema/v1/deep-link-v1.schema.json` (full record
    incl. `click_count`, `viewer_scope` enum, `single_use`).
  - `contracts/openapi/v1/deep-links.yaml` — 6 paths, 9 schemas,
    `bearerAuth` security scheme.
- **Editor UI (`apps/editor`).**
  - `ShareStateButton.tsx` (toolbar, BEM classnames,
    `m7-share-` testid prefix) — encodes current runtime state via
    `StateEncoder`, copies the URL to clipboard, optional QR via
    `renderQr` prop, session-storage `kid`/`key` cache, clipboard
    fallback when the API is unavailable.
  - `deep-links-panel.tsx` (left-side panel, BEM classnames,
    `m7-deep-link-` testid prefix) — lists deep links sorted by
    `created_at` desc with copy/resolve/delete actions.
  - Both mounted in `EditorRoot` as `m7-deep-links-tab`.
  - **14 new editor tests** (ShareStateButton 6, deep-links-panel 8).
- **Renderer toast (`packages/prototype-runtime/src/deep-links/restore-toast.ts`):**
  Pure-TS helpers `resumeToast()`, `expiredToast()`, and
  `partialToast()` with `RESUME_AUTO_DISMISS_MS = 1500`. **5 tests.**
- **E2E:** `apps/editor/e2e/p10-m7-deep-links.spec.ts` — 5 smoke
  tests covering share button render, panel render, sample-resolve,
  restore banner appearance, and copy-URL.

### Phase 10 — Prototyping & Interactivity (M8: MCP Agent Surface)

#### Added

- **Agent schema package (`packages/agent-schema`).** Pure-TS,
  zero-dep address parser for paths like `slide[3].hotspot[cta_pricing]`
  plus shared `Capability | AuditEntry | McpTool | McpContext` types
  used by every M8 tool. **12 tests.**
- **MCP tool surface (`services/mcp-server/src/tools/prototyping/`).**
  48 tools across 12 families (`hotspots`, `overlays`,
  `state-machines`, `variables`, `rules`, `bindings`, `forms`,
  `calculators`, `device-frames`, `quizzes`, `sequences`,
  `deep-links`) plus the M8 meta-tools `nl_patch`, `simulate_sweep`,
  and `deck_diff`. Each tool:
  - Hand-rolled input/output validator returning
    `{ ok, value } | { ok: false, code: 'INVALID_INPUT', issues }`.
  - Capability-claim gated via the in-memory
    `claimCapability(agentId, capability)` router; denied callers
    receive `MCPError('PERMISSION_DENIED')`.
  - Audit-trail appended through the shared `globalAuditTrail`.
  - Routes through `services/prototype-runtime` over HTTP using
    `PROTOTYPE_RUNTIME_URL`.
    **52 service tests** (plus 6 router tests); service suite
    **67/67 passing**.
- **NL Patch API.** `nlPatch(ctx, deckId, prompt)` decomposes
  natural-language prompts into ordered tool calls and exposes
  `apply()` / `rollback()` snapshots; rollback restores inverse
  inputs and surfaces `MCPError('ROLLBACK_FAILED')` on undo failure.
- **Simulator sweep + deck diff.** `simulate_sweep` linear-interpolates
  up to 1024 samples and invokes `compute_calculator` per step
  (≤ 5 ms/sample budget for ≤ 100-node DAGs); `deck_diff` returns
  `{ added, removed, changed }` entries across hotspots, rules,
  variables, calculators, and overlays.
- **Editor surfaces (`apps/editor`).**
  - `m8-audit-tab` — `AuditTrail` component listing entries with
    `{ human | agent }` badge, expandable input/output, and a
    diff-view button. **5 tests.**
  - `m8-nl-patch-tab` — `NlPatchPanel` with textarea, Patch button,
    inline diff preview, and Apply/Rollback controls. **6 tests.**
  - `m8-deck-diff-tab` — `DeckDiffPanel` with two deck inputs and a
    three-list diff view. **5 tests.**
    Editor suite remains **253/253 green** after M8 wiring.
- **Contracts.**
  - `contracts/openapi/v1/mcp-prototyping.yaml` — OpenAPI 3.1.0
    covering all 48 tools + the 3 meta-tools, with Bearer auth.
  - `contracts/mcp/prototyping.tools.json` — `{ tools: [...] }`
    manifest consumed by the MCP host UI.
- **Handoff doc.** `docs/handoff/P09-to-P10.md` updated to mark M8
  as landed (no longer deferred).

### Phase 10 — Prototyping & Interactivity (M4: Forms, Calculators, Device Frames)

- **Forms runtime** (`packages/prototype-runtime/src/forms/`):
  - `FormRegistry` — register/resolve/unregister form defs by id.
  - `input-validator.ts` — coercion (`coerce`), default-value lookup,
    `runValidator`/`effectiveValidators` async-debounced check,
    `DEFAULT_ASYNC_DEBOUNCE_MS`.
  - `autosave-policy.ts` — `AutosavePolicy` debounce/throttle, draft
    callback interface, `DEFAULT_AUTOSAVE_DEBOUNCE_MS`.
  - 34 tests in `form-registry.test.ts`.
- **Calculator runtime** (`packages/prototype-runtime/src/calculators/`):
  - `CalculatorDef` (`form` + `graph` modes), `validateCalculatorDef`.
  - `recompute-engine.ts` — topological propagation through form/graph
    DAGs, cycle detection, sandboxed builtins (`sum`, `average`, `min`,
    `max`, `if`, `coalesce`, `clamp`, `round`, `formatCurrency`, `irr`,
    `npv`), array-literal `[1, 2, 3]` support, formula mini-language
    with operator precedence + parens.
  - Newton-Raphson IRR + bisection fallback for negative-IRR paths.
  - `@domio/decimal128` — 38-digit precision arithmetic
    (`add`, `sub`, `mul`, `div`, `round`, `formatCurrency`,
    `formatNumber`), banker's/half-up/half-down rounding modes.
  - 29 tests in `recompute-engine.test.ts` (form/graph modes,
    topologic order, IRR positive + negative paths, NPV,
    `formatCurrency`, builtin coverage).
- **Device-frame runtime** (`packages/prototype-runtime/src/device-frames/`):
  - `DeviceFrameRegistry`, `DEFAULT_DEVICE_FRAMES` (iPhone 15 / Pro Max,
    iPad 11", Desktop 1280 / 1920), `findDefaultFrame`.
  - 8 tests covering register/resolve/unregister + fallback.
- **Calculator fix post-merge.** `recompute-engine.ts` had six
  `Number(decAdd(...))` / `Number(decDiv(...))` call sites where
  `DecResult.value` should have been used (DecResult is an envelope
  object — `Number({value: '6'}) === NaN`). `formatCurrency` builtin
  was case-sensitive (BUILTINS key was `formatCurrency` but parser
  did `tk.toLowerCase()`) — renamed to lowercase. `evaluateOutput`
  re-ordered so format-specific handling runs _before_ precision
  rounding. New `[ ]` tokenizer + parser support for `npv` array
  literals. `round` builtin switched to `half-down` mode so
  `round(1.55, 1) === 1.5`.
- **Migration test fix.** `tools/infra-test/.../migrations.spec.ts` —
  pg's default array parser returns `text[]` as a JS array (not a
  `{s1,s2,s3}` literal), so the M6.2 round-trip test was updated to
  assert `slides.length === 3` directly.
- **Viewer test infra fix.** jsdom 25 disables `localStorage` on the
  default opaque origin; the viewer vitest config now sets
  `environmentOptions.jsdom.url` to `http://localhost/` and a setup
  file polyfills `localStorage` if the upstream config didn't take.
  ConsentBanner's `waitFor` assertion now uses a 2-second timeout for
  React 19 concurrent-mode effect scheduling.

### Phase 10 — Prototyping & Interactivity (M5: User-Testing Telemetry)

- **Recorder + Aggregator** under `apps/viewer/src/components/`:
  - `ConsentBanner` — three-tier consent UI (opt-in / opt-out /
    anonymous), persisted under `domio.viewer.consent`. 6 tests.
  - Telemetry session + heatmap data models under
    `apps/editor/src/panels/`:
    - `test-sessions-panel.tsx` — list + filter test sessions. 9 tests.
    - `heatmap-panel.tsx` — click / scroll heatmap visualization.
      5 tests.
    - `study-config-panel.tsx` — study-level configuration (tasks,
      success criteria). 13 tests.
- **Migration.** `0031_phase10_telemetry.{up,down}.sql` — telemetry
  tables added (recorded in infra-test).
- **Tests.** 33 telemetry panel/component tests, all green; the
  viewer package now reports **93/93 green** including the
  ConsentBanner suite.

[Unreleased]: https://github.com/DaiyaanMuhammadFardeen/Domio/compare/main...HEAD
