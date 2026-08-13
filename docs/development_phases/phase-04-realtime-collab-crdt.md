# Phase 04 — Real-time collaboration & CRDT sync

> **Phase:** 04
> **Name:** Real-time collaboration & CRDT sync
> **Critical path:** yes
> **Parallel stream:** Foundation (no parallel split; this is a critical-path phase)
> **Owner:** Realtime lead + Editor lead + SRE
> **Stream tag:** `F:CRDT` (foundation/realtime)

## 1. Intent

Phase 04 turns the single-user editor from Phase 03 into a multiplayer experience by introducing a real-time gateway service, a Yjs-based CRDT substrate on the client and server, per-slide / per-theme sub-documents so a 200-slide deck does not sync as one giant document, a presence channel for cursors / selections / avatars / cursor chat / pointer ping, and an offline editing story through a deterministic reconnect protocol that converges CRDT state to a single merged result. This phase is the highest technical-risk item on the critical path and the foundation for branching (Phase 05), audience participation (Phase 16), and presenter co-presence (Phase 15). The output of this phase must pass convergence tests for any scripted concurrent edit scenario and produce a measurable local-to-remote sync under 200 ms p95 on a healthy network.

## 2. Goals

1. **Realtime gateway service is live.** A Go service (`/services/realtime-gateway`) terminates WebSocket connections for `deck:{id}:sync` and `deck:{id}:presence`, speaks gRPC to the control plane, and is backed by NATS JetStream for fan-out and durable CRDT log relay.
2. **Yjs CRDT is the substrate for the document.** Every edit on the canvas is produced as a Yjs update against a sub-document keyed by deck / slide / theme. The client hosts a Yjs document per slide, the server hosts the merged state per deck.
3. **Multiplayer presence is visible.** Two browsers editing the same deck see each other's cursors, selections, avatar chip, and (on `Cmd+Shift+P` or `T`) pointer pings and cursor chat.
4. **Offline editing converges.** A user can drop their network for 5+ minutes, keep editing, and reconnect to a state byte-identical to having been online the whole time.
5. **Conflict-free merge is testable.** The CRDT layer ships with a deterministic convergence test suite that runs the same N concurrent-edit scenarios on every PR and asserts structural and byte-equal state.
6. **The phase is the load-bearing boundary for Phase 05.** Branching, versioning, and 3-way diff all read the CRDT log and sub-documents produced here; the contracts this phase emits are the input to Phase 05 schema and table design.

## 3. Scope

**In scope (feature numbers):**

- #17 Multiplayer live editing with cursors, selections, presence avatars
- #19 Branching & merging of decks — _infrastructure only_ (branch creation, switch, lineage, op-log isolation). The merge resolution UI and merge request lifecycle fully land in Phase 05.
- #21 Offline editing with conflict-free sync on reconnect (CRDT-based)

**Out of scope (handled in later phases):**

- Suggestion mode (`#182`) and the deck merge request visual diff UI (`#183`) — Phase 05 / Phase 18.
- Named checkpoints and visual diffs (`#20`) — Phase 05.
- Comments and thread resolution (`#179`) — Phase 18.
- Audience-side presence (`#142`-`#154`) — Phase 16.
- Live-session analytics (`#176`) — Phase 17.
- Process/runtime failover of regional realtime gateways — Phase 22.

## 4. Dependencies

**Upstream phases (must be complete):**

- **Phase 00** — repo, monorepo conventions, contract rule, generated clients, contract CI.
- **Phase 01** — observability SDK, OpenTelemetry, Prometheus, NATS JetStream, Redis/Valkey, CI/CD pipeline, container images.
- **Phase 02** — `decks`, `slides`, `elements`, `crdt_logs` table skeleton; `packages/schema`; deck JSON shape.
- **Phase 03** — canvas editor MVP, scene graph, history engine, single-user autosave, command dispatcher; the inputs that produce Yjs updates come from Phase 03's history engine.

**Downstream phases (this phase unblocks):**

- **Phase 05** — reads the CRDT log and sub-documents to build versioned snapshots, branches, merge requests, and 3-way diff.
- **Phase 06** — components run on the same CRDT substrate; per-slide sub-documents carry component overrides.
- **Phase 10** — prototype variables and interactions ride the same CRDT layer.
- **Phase 13** — agentic edits flow through the same CRDT protocol with `author_kind: 'agent'`.
- **Phase 15, 16** — presenter and audience reuse the realtime gateway; presence channel is the foundation.

## 5. Workstreams

### Stream A — Realtime gateway skeleton (Go)

**Owner:** Realtime lead. **Critical path task.** Run in parallel with Stream B.

**A.1 Service skeleton and WS endpoint**

- Files: `/services/realtime-gateway/cmd/rtgw/main.go`, `/services/realtime-gateway/internal/{router,handshake,session}.go`, `/services/realtime-gateway/internal/transport/ws.go`, `/services/realtime-gateway/internal/transport/grpc.go`.
- Packages added: `services/realtime-gateway` (Go), `services/realtime-gateway/gen/domio/realtime/v1` (generated), `packages/sdk-go/realtime` (generated client wrapper).
- Contracts added: `contracts/proto/domio/realtime/v1/realtime.proto` (Hello, Welcome, Op, OpAck, Presence, PeerJoined, PeerLeft, BranchSwitch, BranchHead, Error); generated clients committed under `services/realtime-gateway/gen/`.
- Contracts consumed: `contracts/proto/domio/identity/v1/auth.proto` (JWT verification), `contracts/proto/domio/deck/v1/deck.proto` (read deck metadata, ACL), `contracts/proto/domio/controlplane/v1/command.proto` (write materialized projections).
- WS protocol: `wss://rtgw.domio/v1/sync/{deckId}` (sync) and `wss://rtgw.domio/v1/presence/{deckId}` (presence). Initially `gorilla/websocket`; an `nhooyr.io/websocket` adapter is allowed if benchmarks demand.
- Tests: unit tests for handshake, JWT verification, session table, gRPC clients; integration test that spins up 2 clients + 1 server and asserts op relay within 50 ms.
- DoD: a deck subscription succeeds with a valid JWT, returns the server's current HLC, and streams live ops to the client.

**A.2 NATS JetStream integration and topic layout**

- Files: `/services/realtime-gateway/internal/bus/nats.go`, `/services/realtime-gateway/internal/topics/topics.go`.
- Topics: `realtime.deck.{deckId}.crdt` (CRDT updates), `realtime.deck.{deckId}.presence` (presence deltas), `realtime.deck.{deckId}.meta` (peer joins/leaves, branch switches).
- Use JetStream consumer groups per (deck, branch) for replay; reject "consume from latest" only — must support resume from `clientVectorHLC`.
- Tests: assert JetStream replay from a checkpoint, idempotent op application, and at-least-once ack semantics.
- DoD: a second tenant process can replay all missed ops after a 30 s network partition and converge.

**A.3 Presence channel and ephemeral state**

- Files: `/services/realtime-gateway/internal/presence/{redis.go,fanout.go,avatar.go}`, `/services/realtime-gateway/internal/presence/chat.go`, `/services/realtime-gateway/internal/presence/ping.go`.
- Backed by Redis with `EXPIRE 60` per session; presence is rebuilt deterministically on reconnect from the join sequence.
- Cursor updates throttled to 30 Hz client-side; chat messages rate-limited to 1 per 2 s per user; ping rate-limited to 1 per 2 s.
- Tests: presence convergence test (5 clients, 3 of them disconnect, reconnect, see the correct 2/3/5 peer state); ping rate limit unit test.
- DoD: cursor positions render on receivers within 80 ms p95 on reference LAN; chat bubbles auto-fade after 8 s.

**A.4 HLC clock, op validation, idempotency**

- Files: `/services/realtime-gateway/internal/hlc/hlc.go`, `/services/realtime-gateway/internal/ops/validate.go`.
- Every op carries `op_id` (ULID), `author_id`, `hlc`, `parent_hlc`. Server validates HLC ordering, rejects reordered duplicates, and applies idempotency via `(op_id)` primary key.
- Tests: unit table-driven for HLC monotonicity, op replay idempotency, malicious op rejection.
- DoD: 100k ops replay produces a deterministic state identical to the live stream.

### Stream B — Yjs client and sub-documents

**Owner:** Editor lead. **Critical path task.** Run in parallel with Stream A.

**B.1 Yjs substrate and sub-document map**

- Files: `/packages/yjs-shared/src/index.ts`, `/packages/yjs-shared/src/subdocs.ts`, `/packages/yjs-shared/src/awareness.ts`, `/apps/editor/src/sync/{provider,subdocs,awareness-client}.ts`.
- One `Y.Doc` per slide; one `Y.Doc` per theme; one `Y.Doc` for deck-level metadata (slide order, names).
- Sub-document map: `deck:{deckId}` → root metadata doc, `slide:{slideId}` → slide doc, `theme:{themeId}` → theme doc. The deck root doc holds the slide RGA order and per-slide sub-doc GUID refs.
- Native types: `Y.Map` for layer property bags, `Y.Array` for z-order, `Y.Text` for text layers, RGA-compatible patterns for the slide rail.
- Contracts added: `contracts/schema/crdt/{slide,theme,deck-root}.schema.json` documenting the Yjs shape in JSON Schema for cross-language readers.
- Tests: cross-client unit test (Yjs + y-webrtc fallback) that creates two replicas, replays concurrent edits, asserts state equality.
- DoD: a single slide with 500 elements converges deterministically across three browser instances.

**B.2 Local op queue, IndexedDB persistence, offline**

- Files: `/apps/editor/src/sync/{local-queue.ts,indexeddb-provider.ts,backoff.ts}`, `/packages/yjs-shared/src/persistence.ts`.
- y-indexeddb persists the full sub-doc set; outbound queue persists until server ack; inbound queue applies Yjs updates in causal order.
- Network drop detection: 2 missed heartbeats @ 5 s = offline; recover on reconnect by sending local vector HLC gap to server.
- Tests: Playwright + network throttle — disconnect for 5 min, edit 200 ops, reconnect, assert convergence to identical Yjs state using `Y.encodeStateAsUpdate` digest.
- DoD: offline works in production-equivalent Chromium with the service worker cache + IndexedDB queue.

**B.3 CRDT ⇄ history engine bridge**

- Files: `/apps/editor/src/sync/bridge.ts`, `/apps/editor/src/history/command-pattern.ts` (extended), `/apps/editor/src/history/remote-op-applier.ts`.
- Local commands continue to write to the history engine (Phase 03). A new "bridge" turns local committed commands into Yjs updates and emits remote ops as new history entries tagged with `author_id` of the remote user.
- Bidirectional: a remote op applies to the local replica and emits a single `RemoteOpApplied` history entry (no per-op undo on the remote side).
- Tests: integration test that emits 50 ops from a "local" client and 50 from a "remote" client, asserts local history count and remote history attribution.
- DoD: undo on a multi-client session undoes only the local user's edits, never remote edits.

**B.4 Awareness / presence client**

- Files: `/apps/editor/src/sync/awareness-client.ts`, `/apps/editor/src/canvas/presence-overlay.tsx`, `/apps/editor/src/canvas/cursor-chat.tsx`, `/apps/editor/src/canvas/pointer-ping.tsx`.
- Uses Yjs's `Awareness` protocol over the realtime gateway's presence channel. Cursor colors are deterministic from `user_id` hash.
- "Follow user" feature: clicking an avatar in the avatar list pins the local viewport to the remote user's viewport.
- DoD: visual smoke test — two browsers, cursors move, selection highlights match, chat bubble appears and fades.

### Stream C — Contracts and observability

**Owner:** Platform lead. **Run in parallel with Streams A and B.**

**C.1 Proto contracts**

- Files: `contracts/proto/domio/realtime/v1/realtime.proto`, `contracts/proto/domio/controlplane/v1/command.proto` (extended for branch ops), `contracts/proto/domio/identity/v1/auth.proto` (extended with `session_kind`).
- Generated clients commit to `services/realtime-gateway/gen/`, `services/control-plane/gen/`, `packages/sdk-go/realtime/`, `packages/sdk-ts/realtime/`.
- CI: `buf breaking --against '.git#branch=main'` must pass.
- DoD: any breaking change between phases fails CI.

**C.2 OpenAPI touch-ups**

- Files: `contracts/openapi/v1/realtime.yaml` (sync status, presence status endpoints), `contracts/openapi/v1/internal.yaml` (admin-only ops replay).
- DoD: SDKs regenerate without manual edits.

**C.3 Observability and metrics**

- Files: `/services/realtime-gateway/internal/observability/metrics.go`, `/apps/editor/src/observability/rum.ts`.
- Metrics: `sync_op_apply_duration_ms`, `sync_op_round_trip_ms`, `sync_active_connections`, `sync_crdt_convergence_ms`, `presence_active_sessions`, `presence_cursor_latency_ms`.
- Traces: spans for `realtime.hello`, `realtime.op.apply`, `realtime.presence.fanout`, `yjs.bridge.apply`.
- Logs: structured JSON with `traceId`, `deckId`, `branchId`, `authorId`; never log full Yjs payload bytes.
- DoD: Grafana dashboard with the metrics above is live in staging.

### Stream D — Verification and load testing

**Owner:** QA + SRE. **Run after Streams A, B, C merge.**

**D.1 Convergence tests**

- Files: `/tests/convergence/yjs-scenarios.test.ts`, `/tests/convergence/presence.test.ts`.
- Scenario corpus: 200 generated concurrent-edit scripts (concurrent property edits, concurrent reorders, concurrent text + image, concurrent drag across two decks) plus 50 presence scripts.
- For each scenario: run two replicas offline, sync, assert byte-equal `Y.encodeStateAsUpdate(state)` and `Y.encodeStateVector(state)`.
- Tests run in CI on every PR (unit) and nightly on staging (integration).
- DoD: 0 failing scenarios on 100 different seeds.

**D.2 Load and chaos**

- Files: `/tests/load/k6-realtime.js`, `/tests/chaos/toxiproxy-realtime.yaml`.
- 50 concurrent editors per deck, 10 decks, 1k cursors per session, op sustained 200 ops/sec for 10 minutes; assert p95 round-trip < 200 ms.
- Toxiproxy: 300 ms latency + 1% loss; assert graceful degradation and no data loss.
- DoD: load test passes; chaos test passes.

## 6. Architecture & data

### 6.1 New modules and services

- **Realtime gateway** (`/services/realtime-gateway`, Go) — see Stream A. Independent Deployment, horizontally scalable, NATS-backed.
- **CRDT sync workers** (`/workers/sync`, Go) — long-running workers that consume the durable CRDT log from JetStream, materialize per-deck state into Postgres (`crdt_logs`), and snapshot every 5,000 ops. Workers also prune the op log after 30 days.
- **Yjs shared package** (`/packages/yjs-shared`, TS) — single source of truth for Yjs sub-doc shaping, awareness, persistence provider, and `Vector`-aware updates.
- **Editor sync module** (`/apps/editor/src/sync`, TS) — wiring between history engine, CRDT, presence, and IndexedDB.

### 6.2 New tables and migrations

Reference `/docs/05-data-database-design.md`. Migrations owned by data platform; merged via Phase 01's migration workflow.

- **Extend `crdt_logs`** (already in `05`): ensure `op_id` is `text` (ULID) PK, `deck_id`, `branch_id`, `slide_id`, `author_id`, `hlc`, `parent_hlc`, `payload jsonb`, `applied_at`. Add `branch_id` (nullable; default = `main`).
- **New `presence_sessions` table** (preview here; full lifecycle in Phase 16):
  ```sql
  create table presence_sessions (
    session_id uuid primary key,
    deck_id uuid not null references decks(id) on delete cascade,
    user_id uuid not null references users(id) on delete cascade,
    branch_id uuid,                             -- nullable; defaults to main
    color text not null,
    connection_id text not null,
    last_seen_at timestamptz not null default now()
  );
  create index presence_deck on presence_sessions (deck_id, last_seen_at desc);
  ```
- **New `branch_heads` shadow table** (Phase 05 will own, but phase 04 writes the row): `(deck_id, branch_id, hlc, updated_at)`. Used by the realtime gateway to determine the live HLC for outbound fan-out.
- **Migrations:** `migrations/2026XX_phase04_crdt_branch.sql` adds `branch_id` to `crdt_logs` (nullable, backfill `main`); `migrations/2026XX_phase04_presence.sql` creates `presence_sessions`.

### 6.3 New contracts

- `contracts/proto/domio/realtime/v1/realtime.proto` — message types listed in Stream A.1.
- `contracts/proto/domio/controlplane/v1/command.proto` — extend with `BranchSwitch`, `BranchHead`, `ReplayOps` calls.
- `contracts/schema/crdt/{slide,theme,deck-root}.schema.json` — JSON Schema documentation of Yjs shape for cross-language code generation.
- `contracts/openapi/v1/realtime.yaml` — sync/presence status endpoints.

### 6.4 New events on the bus

- `realtime.deck.{deckId}.crdt` — CRDT update frames.
- `realtime.deck.{deckId}.presence` — ephemeral presence deltas (TTL 60 s).
- `realtime.deck.{deckId}.peer` — peer joined/left/branch-switched (projected into Postgres for audit).

### 6.5 Cross-references to master docs

- **`/docs/04-system-architecture.md` §4.2 (Container Architecture)** — places the realtime gateway as a tier between edge and control plane; this phase wires it.
- **`/docs/04-system-architecture.md` §4.4 (Module Boundaries)** — `Canvas/Sync (presence fan-out)` module becomes actually live in this phase.
- **`/docs/04-system-architecture.md` §4.5 (Client Architecture)** — adds `deck document state (Yjs sub-documents)` as the third state layer.
- **`/docs/05-data-database-design.md` §5.2.10 (crdt_logs)** — schema is the durable mirror of the CRDT log.
- **`/docs/06-technology-stack.md` §6.2.2 (Realtime gateway — Go)** — this phase is the implementation.
- **`/docs/06-technology-stack.md` §6.1.3 (Yjs over Automerge)** — locks the choice.
- **`/docs/editor-canvas.md` §3.3 (Conflict resolution semantics)** — implementation of that choice.

## 7. Verification

| Feature                  | Test                                                           | Expected result                                                           | Owner         |
| ------------------------ | -------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------- |
| #17 cursor fan-out       | 2 browsers edit same deck over LAN, move cursor continuously   | Remote cursor renders within 80 ms p95                                    | Editor lead   |
| #17 selection visibility | User A selects layer; User B sees matching colored outline     | Selection rendered within 120 ms p95                                      | Editor lead   |
| #17 avatar join/leave    | User C joins; Users A and B see avatar chip                    | Avatar visible within 200 ms                                              | Editor lead   |
| #18 cursor chat          | User A holds T, types, sends                                   | Chat bubble appears on User B at the same world position, fades after 8 s | Editor lead   |
| #18 pointer ping         | User A presses Cmd+Shift+P                                     | 1.2 s expanding ring visible on User B at the same world position         | Editor lead   |
| #19 branch infra (split) | Create branch from named checkpoint via REST                   | `branches` row created; `branch_id` carried in subsequent ops             | Realtime lead |
| #19 branch switch        | Editor calls branch switch                                     | Local replica swaps to branch sub-doc; remote peers see branch change     | Editor lead   |
| #21 offline edit         | Chrome devtools: offline 5 min, 200 ops, reconnect             | Server state synced to identical Yjs state; no data loss                  | Editor lead   |
| #21 convergence          | 200-script convergence suite                                   | 0 failing scenarios; byte-equal state on both replicas                    | QA lead       |
| #21 reconnect            | WS reconnect after 30 s partition                              | Replay from last HLC; deterministic state                                 | Realtime lead |
| HLC safety               | 100k ops replay test                                           | Final state identical to live                                             | Realtime lead |
| Idempotency              | Submit same op 3×                                              | Single apply; rest are no-op                                              | Realtime lead |
| Load 50/10               | k6 50 editors × 10 decks, 200 ops/sec                          | p95 round-trip < 200 ms; no dropped ops                                   | SRE           |
| Chaos                    | Toxiproxy 300 ms latency + 1% loss                             | No data loss; degraded latency only                                       | SRE           |
| Security gate            | Threat model diff for `realtime.proto` enumerated and reviewed | All risks mitigated or explicitly accepted                                | Security lead |
| Observability            | Grafana dashboard with required metrics                        | All panels populated in staging                                           | SRE           |
| Contract CI              | `buf breaking` + OpenAPI lint                                  | Pass on PR                                                                | Platform lead |

## 8. Risks & open decisions

| Risk                                                           | Likelihood | Impact | Mitigation                                                                                                 |
| -------------------------------------------------------------- | ---------- | ------ | ---------------------------------------------------------------------------------------------------------- |
| Yjs sub-doc fan-out cost blows up at 500+ slides               | medium     | high   | Per-slide sub-doc isolation; snapshot every 5,000 ops; benchmark on a 1,000-slide synthetic deck before G1 |
| HLC clock skew breaks causal ordering across regions           | medium     | high   | Use monotonic HLC with PTP-synced clocks in production; assert clock-drift alerts in Phase 01              |
| WebSocket connection storms on deck open                       | medium     | high   | Per-tenant connection quotas (per `/docs/04` §4.12); jittered backoff on client                            |
| IndexedDB quota exceeds browser limit on long offline sessions | medium     | medium | Apply ring buffer of last 5,000 ops per slide; warn on >80% quota                                          |
| Concurrent ordering of slide RGA collapses under heavy reorder | low        | high   | Phase 02 RGA choice; convergence test in §D.1 catches regressions                                          |
| Adoption of Liveblocks/Ably managed fallback                   | n/a        | cost   | Adapter in place; decision deferred to `/docs/04` OD-ARCH-02                                               |
| Cursor color hashing collisions                                | low        | low    | Stable seeded hash + uniqueness fallback to a palette of 64 deterministic colors                           |
| Open: WebGPU vs WebGL2 cursor overlay precision                | low        | low    | Use offscreen canvas + GPU transforms; OD-STK-01                                                           |

## 9. Demo

The "internal demo" for Phase 04 is a 12-minute live walkthrough on a fully deployed staging environment. Script:

1. **Two laptops, two browsers, same deck.** Open `/decks/demo-pitch` in both. The editor renders both users' avatars in the top-right.
2. **Cursor fan-out.** User A moves the cursor across the canvas. User B sees a smoothly interpolated cursor in User A's color within 80 ms (visible stopwatch).
3. **Selection visibility.** User A selects an element. User B sees a matching colored outline appear within 120 ms.
4. **Cursor chat.** User A holds `T`, types "what about a darker headline here?", presses Enter. User B sees a chat bubble anchored at the cursor world position; bubble fades after 8 s.
5. **Pointer ping.** User A presses `Cmd+Shift+P`. User B sees a 1.2 s expanding ring at the same world position.
6. **Branch creation (infrastructure only).** User A opens the dev console and runs `POST /v1/decks/{id}/branches` with `{name: "experiment/header-v2", baseCheckpointId: "..."}`. The branch is created; the `branch_id` appears in the next emitted op. (Full MR UI is Phase 05.)
7. **Offline edit.** User A turns off Wi-Fi (devtools: offline mode). User A drags an element and edits text. After 2 minutes, User A turns Wi-Fi back on. Both decks converge; the `syncing…” indicator` clears; every cursor and selection is in sync.
8. **Convergence test in CI.** Show the GitHub Actions run for the convergence suite: 200/200 scenarios green.
9. **Grafana dashboard.** Show the realtime gateway dashboards: active connections, op round-trip p95 (well under 200 ms), CRDT convergence ms p95 (under 1 s), presence cursor latency p95.
10. **Schema and contracts.** Show the merged `realtime.proto`, the `crdt_logs` migration, and the `presence_sessions` table populated by the demo.

Acceptance: the demo completes end-to-end with no manual intervention, no console errors, and no data loss after the offline test.

## 10. Definition of Done

- [ ] Code merged to `main` for `/services/realtime-gateway`, `/packages/yjs-shared`, `/apps/editor` (sync module), `/workers/sync`, and `/contracts`.
- [ ] `buf breaking` passes; generated clients committed; OpenAPI lints clean.
- [ ] All unit, integration, and 200-script convergence tests pass on PR and on main.
- [ ] Load test (50 × 10 × 200 ops/sec) passes; chaos test passes.
- [ ] Migrations `2026XX_phase04_crdt_branch.sql` and `2026XX_phase04_presence.sql` applied to staging with backout rehearsed.
- [ ] Grafana dashboard with the §5-C.3 metrics is live and pinned; alerts on `op_round_trip_ms p95 > 250 ms` and `crdt_convergence_ms p95 > 2000 ms` are wired.
- [ ] OpenTelemetry traces flow from editor → gateway → control plane with `traceId` propagation across WS frames.
- [ ] Versioned `realtime.proto` is `v1.0.0` and tagged in `/contracts/CHANGELOG.md`.
- [ ] Security review: threat model + `realtime.proto` auth, idempotency, rate limits, and presence privacy reviewed by Security lead.
- [ ] Documentation: `/docs/04` §4.5.2 cross-references the implementation; this phase doc is cross-linked from `/docs/feature-list.md` for features #17, #19 (infra), #21.
- [ ] Internal demo passed; demo recording linked in the phase Status field.
- [ ] Phase 02's `deck canonical row` and `crdt_ops` tables are populated by the demo; Phase 05 has the inputs it needs.
