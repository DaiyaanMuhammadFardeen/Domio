// Package idempotency derives the per-(workspace, viewer, event)
// idempotency key the crm-sync worker uses to deduplicate retries.
//
// The contract:
//   key = sha256(workspaceID | viewerID | eventType | eventID)
//
// where `|` is a 0x00 byte separator (not a printable character)
// so collisions require all four components to match exactly.
//
// The idempotency key is stored on crm_sync_record.idempotency_key
// with a UNIQUE (connection_id, idempotency_key) constraint. A
// duplicate push against the same connection therefore collapses
// to a single row in the warehouse.
package idempotency

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
)

// ErrEmptyComponent is returned by Key() when any input is empty.
// We reject empty inputs early so a bug in the producer can't
// silently collapse unrelated events onto one key.
var ErrEmptyComponent = errors.New("idempotency: empty component")

// Key returns the canonical 64-char hex SHA-256 of the 4-tuple.
//
// Inputs:
//   workspaceID — workspace_id from the analytics event
//   viewerID    — viewer_id_key (salted hash, privacy-mode aware)
//   eventType   — event_name (e.g. "view", "interaction")
//   eventID     — event_id (server-issued UUIDv4)
func Key(workspaceID, viewerID, eventType, eventID string) (string, error) {
	if workspaceID == "" || viewerID == "" || eventType == "" || eventID == "" {
		return "", ErrEmptyComponent
	}
	h := sha256.New()
	h.Write([]byte(workspaceID))
	h.Write([]byte{0})
	h.Write([]byte(viewerID))
	h.Write([]byte{0})
	h.Write([]byte(eventType))
	h.Write([]byte{0})
	h.Write([]byte(eventID))
	return hex.EncodeToString(h.Sum(nil)), nil
}

// KeyOrPanic is Key() that panics on error. Use it only at the
// trust boundary (orchestrator entry) so the rest of the code
// can treat the key as infallible.
func KeyOrPanic(workspaceID, viewerID, eventType, eventID string) string {
	k, err := Key(workspaceID, viewerID, eventType, eventID)
	if err != nil {
		panic(fmt.Sprintf("idempotency: %v", err))
	}
	return k
}
