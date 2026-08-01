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

## [0.1.1] - Unreleased

### Changed

- Initial contract suite scaffold (Phase 00).
- Common schemas, deck placeholder, health protos.
