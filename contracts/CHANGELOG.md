# Contracts Changelog

All notable changes to the Domio contracts are documented here.
Versions follow the contracts/VERSION file for the overall contract
suite, with individual proto packages versioned independently.

## [1.0.0] - 2026-08-01

### Added

- **realtime.proto v1.0.0** (`contracts/proto/domio/realtime/v1/realtime.proto`)

  - WebSocket sync protocol for Phase 04 realtime collaboration.
  - Handshake frames: `Hello`, `Welcome`.
  - CRDT operation frames: `Op`, `OpAck`.
  - Presence frames: `Presence`, `PeerJoined`, `PeerLeft`.
  - Branch management frames: `BranchSwitch`, `BranchHead`.
  - Error frame: `Error` with `RealtimeErrorCode` enum.
  - `HLC` (Hybrid Logical Clock) timestamp type.
  - Enums: `OpType`, `PresenceKind`, `RealtimeErrorCode`.

- **controlplane command.proto v1.0.0** (`contracts/proto/domio/controlplane/v1/command.proto`)

  - `ControlPlaneService` RPCs: `StartRealtimeSession`, `EndRealtimeSession`, `GetBranchHead`, `ListBranches`.
  - Session management messages for WebSocket ticket exchange.
  - Branch management messages for branch head queries.

- **Realtime OpenAPI** (`contracts/openapi/v1/realtime.yaml`)

  - `GET /v1/realtime/decks/{deckId}/sync/status` — connection count, head HLC, active branches.
  - `GET /v1/realtime/decks/{deckId}/presence/status` — active sessions, avatar list.
  - WebSocket operations documented (informational): `wss://rtgw.domio/v1/sync/{deckId}`, `wss://rtgw.domio/v1/presence/{deckId}`.

- **Internal OpenAPI** (`contracts/openapi/v1/internal.yaml`)

  - `POST /v1/internal/replay` — admin-only CRDT ops replay from HLC checkpoint.
  - Secured with `X-Api-Key` header (apiKey security scheme).

- **CRDT sub-document JSON Schemas** (`contracts/schema/crdt/`)

  - `slide.schema.json` — Yjs slide sub-doc shape: meta, aspect, zOrder (RGA), elements, elementProps, text.
  - `theme.schema.json` — Yjs theme sub-doc shape: colors (palette tokens), fonts (typography tokens).
  - `deck-root.schema.json` — Yjs deck root shape: meta, subdocs (SubDocRegistry), slideOrder (RGA), branch.

- **sdk-go/realtime** (`packages/sdk-go/realtime/`)

  - Go client wrapper for the realtime gateway WebSocket.
  - Frame codec: length-prefix framing with protobuf marshal/unmarshal.
  - Client: `Connect`, `SendOp`, `ReadFrame`, `Close`.
  - Unit test for frame codec round-trip.
  - Minimal example (`example_test.go`).

- **control-plane gen** (`services/control-plane/gen/`)
  - TypeScript client types for `domio.controlplane.v1` RPCs.
  - Re-exports session management and branch management types.

## [1.1.0] - 2026-08-01

### Added

- **branch.proto v1.0.0** (`contracts/proto/domio/branch/v1/branch.proto`)

  - Branch CRUD: `CreateBranch`, `GetBranch`, `ListBranches`, `ArchiveBranch`.
  - Branch switch: `Checkout` returns branch head and HLC resume vector.
  - Lineage: `GetLineage` computes ancestry chain from branch to main.
  - Enums: `BranchStatus`, `BranchErrorCode`.
  - Service: `BranchService`.

- **checkpoint.proto v1.0.0** (`contracts/proto/domio/checkpoint/v1/checkpoint.proto`)

  - Checkpoint CRUD: `CreateCheckpoint`, `GetCheckpoint`, `ListCheckpoints`, `RenameCheckpoint`.
  - Restore: `RestoreCheckpoint` creates a new forward edge in history.
  - Enums: `CheckpointKind` (named/auto), `CheckpointErrorCode`.
  - Service: `CheckpointService`.

- **merge.proto v1.0.0** (`contracts/proto/domio/merge/v1/merge.proto`)

  - MR lifecycle: `CreateMergeRequest`, `GetMergeRequest`, `ListMergeRequests`.
  - Resolution: `ResolveMergeRequest` (theirs/ours/manual strategies).
  - Commit: `CommitMergeRequest` produces a new branch head.
  - Close: `CloseMergeRequest` closes without merging.
  - Embedded `DiffSummary`, `DiffSlideChanges`, `DiffElementChange`, `DiffConflict` messages.
  - Enums: `MergeRequestStatus`, `ResolutionStrategy`, `MergeErrorCode`.
  - Service: `MergeService`.

- **diff.proto v1.0.0** (`contracts/proto/domio/diff/v1/diff.proto`)

  - Diff computation: `ComputeDiff` returns structured 3-way diff.
  - Diff retrieval: `GetDiff` fetches stored diff by MR ID.
  - Embedded `DiffSummary`, `DiffSlideChanges`, `DiffElementChange`, `DiffConflict` messages.
  - Enums: `DiffErrorCode`.
  - Service: `DiffService`.

- **Branches OpenAPI** (`contracts/openapi/v1/branches.yaml`)

  - `POST /v1/decks/{deckId}/branches` — create branch.
  - `GET /v1/decks/{deckId}/branches` — list branches with status filter.
  - `POST /v1/decks/{deckId}/branches/{branchId}/checkout` — switch editor to branch.
  - `POST /v1/decks/{deckId}/branches/{branchId}/archive` — soft-archive branch.
  - `GET /v1/decks/{deckId}/branches/{branchId}/lineage` — branch ancestry.

- **Checkpoints OpenAPI** (`contracts/openapi/v1/checkpoints.yaml`)

  - `POST /v1/decks/{deckId}/checkpoints` — create named checkpoint.
  - `GET /v1/decks/{deckId}/checkpoints` — list with branch/kind filters.
  - `PATCH /v1/decks/{deckId}/checkpoints/{checkpointId}` — rename checkpoint.
  - `POST /v1/decks/{deckId}/checkpoints/{checkpointId}/restore` — non-destructive restore.

- **Merge Requests OpenAPI** (`contracts/openapi/v1/merge_requests.yaml`)

  - `POST /v1/decks/{deckId}/merge_requests` — create MR with initial diff.
  - `GET /v1/decks/{deckId}/merge_requests` — list with status filter.
  - `GET /v1/decks/{deckId}/merge_requests/{mrId}` — fetch MR + diff.
  - `POST /v1/decks/{deckId}/merge_requests/{mrId}/resolve` — resolve conflicts.
  - `POST /v1/decks/{deckId}/merge_requests/{mrId}/merge` — commit merge.

- **Diff OpenAPI** (`contracts/openapi/v1/diff.yaml`)

  - `POST /v1/decks/{deckId}/diff` — compute 3-way diff.
  - `GET /v1/decks/{deckId}/diff/{mrId}` — get stored diff.

- **Diff Summary JSON Schema** (`contracts/schema/merge/diff_summary.schema.json`)
  - Structured 3-way diff shape shared by editor UI and agentic layer.
  - Covers slide-level changes, per-element changes, and conflicts.

## [0.1.1] - Unreleased

### Changed

- Initial contract suite scaffold (Phase 00).
- Common schemas, deck placeholder, health protos.

## [0.2.0] - 2026-08-08

### Phase 16 pre-flight scaffolding

- **session-code generator** (`packages/session-code/src/session-code.ts`)

  - Crockford base32 + 4-bit XOR checksum nibble.
  - Configurable body length and shard-bit allocation.
  - Round-trip-safe parse with case-insensitive normalisation.

- **text-normalize** (`packages/text-normalize/`)

  - NFKC normalization + zero-width / bidi-control stripping.
  - Locale-aware stopword lists: en, bn, es (`packages/text-normalize/src/stopwords/`).
  - `normalize`, `tokenize`, `bucketKey` primitives used by word-cloud and qa engines.

- **moderation** (`packages/moderation/`)

  - Blocklist matcher (`checkBlocklist`) operating on normalised input.
  - Pluggable `MlScorer` interface for hosted ML classifiers (Detoxify / custom BERT).
  - Null scorer default for tests + boot.

- **protocol** (`packages/protocol/src/audience-envelope.ts`)

  - Discriminated `AudienceEnvelope` covering hello, welcome, poll, quiz,
    qa, word-cloud, reactions, nav, sentiment, raise-hand, error.
  - Type-safe `narrowEnvelope<K>(...)` discriminator helper.

- **audience-service** (`services/audience/src/`)

  - Cross-shard types (`ShardCoordinate`, `AudienceJoinBundle`, `AudienceWidgetDescriptor`).
  - Error hierarchy: `AudienceSessionNotFoundError`, `AudienceRateLimitedError`,
    `AudienceModerationError`, `AudienceConflictError`.

- **contracts** (`contracts/`)
  - `openapi/v1/audience-join.yaml` — `/v1/audience/join`, status, leave.
  - `proto/domio/v1/audience.proto` — `AudienceEnvelope` + 11 payload messages.
  - `events/audience/session-joined.json` and `session-left.json` — JSON-schema events.
