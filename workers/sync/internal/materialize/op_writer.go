// Package materialize exposes the op-writer entry point for Phase 05.
//
// `OpWriter` is the thin orchestration layer that the JetStream consumer
// in `cmd/sync-worker` calls into.  The underlying store is the
// pgx-backed `Materializer` from materialize.go — `OpWriter` simply
// adds:
//
//   - safety net dedup pass (`Dedup`) that callers can apply on op-payload
//     byte-equality after a deploy where the durable log experienced a
//     partial-redelivery storm;
//   - mapping the realtime proto OpType into the `op_kind` column added
//     in migration 0006;
//   - per-deck byte-size accounting so the snapshot manager can size
//     payloads correctly.
//
// The phase 05 spec lists the file path
// `internal/materialize/op_writer.go` explicitly; this is the home for
// that surface.

package materialize

import "strings"

// OpKindOpWriter mirrors the values of the `op_kind` text column added
// in migration 0006_phase05_deck_revisions.up.sql.  The writer uses
// these canonical strings instead of the protobuf enum so Postgres can
// index the column directly without an enum cast.
const (
	OpKindCRDT       = "crdt"
	OpKindCheckpoint = "checkpoint"
	OpKindSnapshot   = "snapshot"
	OpKindUnknown    = "unspecified"
)

// ProtoOpToKind maps a realtime.proto OpType to its `op_kind` string.
// Both file paths use this so the writer and the test fixtures agree.
func ProtoOpToKind(t string) string {
	switch strings.ToLower(strings.TrimSpace(t)) {
	case "yjs_update", "yjs-update", "update":
		return OpKindCRDT
	case "checkpoint":
		return OpKindCheckpoint
	case "snapshot":
		return OpKindSnapshot
	default:
		return OpKindUnknown
	}
}
