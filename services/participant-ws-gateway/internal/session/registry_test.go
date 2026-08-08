package session_test

import (
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/domio/platform/services/participant-ws-gateway/internal/session"
)

func TestRegistry_AddThenCount(t *testing.T) {
	r := session.New()
	for i := 0; i < 5; i++ {
		err := r.Add(&session.Participant{
			ID:          fmt.Sprintf("p%d", i),
			WorkspaceID: "w",
			SessionCode: "c",
			SessionID:   "s",
			ShardIndex:  i % 2,
			JoinedAt:    time.Now(),
			LastSeenAt:  time.Now(),
			State:       session.StateActive,
		})
		if err != nil {
			t.Fatalf("add: %v", err)
		}
	}
	if r.CountForSession("c") != 5 {
		t.Fatalf("expected 5 active, got %d", r.CountForSession("c"))
	}
	counts := r.ShardCounts("c")
	if counts[0]+counts[1] != 5 {
		t.Fatalf("expected shard counts summing to 5, got %v", counts)
	}
}

func TestRegistry_DuplicateRejected(t *testing.T) {
	r := session.New()
	p := &session.Participant{ID: "p1", WorkspaceID: "w", SessionCode: "c", SessionID: "s", State: session.StateActive}
	if err := r.Add(p); err != nil {
		t.Fatalf("first add: %v", err)
	}
	err := r.Add(p)
	if !errors.Is(err, session.ErrDuplicate) {
		t.Fatalf("expected ErrDuplicate, got %v", err)
	}
}

func TestRegistry_TouchBumpsState(t *testing.T) {
	r := session.New()
	_ = r.Add(&session.Participant{ID: "p1", WorkspaceID: "w", SessionCode: "c", SessionID: "s", State: session.StateIdle})
	if err := r.Touch("c", "p1", time.Now()); err != nil {
		t.Fatalf("touch: %v", err)
	}
}

func TestRegistry_RemoveIsIdempotent(t *testing.T) {
	r := session.New()
	_ = r.Add(&session.Participant{ID: "p1", WorkspaceID: "w", SessionCode: "c", SessionID: "s", State: session.StateActive})
	r.Remove("c", "p1")
	r.Remove("c", "p1")
	if r.CountForSession("c") != 0 {
		t.Fatalf("expected 0 after remove")
	}
}

func TestRegistry_TouchUnknownReturnsError(t *testing.T) {
	r := session.New()
	if err := r.Touch("c", "p1", time.Now()); err == nil {
		t.Fatalf("expected error")
	}
}

func TestRegistry_SnapshotReturnsDefensiveCopy(t *testing.T) {
	r := session.New()
	_ = r.Add(&session.Participant{ID: "p1", WorkspaceID: "w", SessionCode: "c", SessionID: "s", State: session.StateActive})
	snap := r.Snapshot("c")
	if len(snap) != 1 {
		t.Fatalf("expected 1")
	}
	snap[0].ID = "mutated"
	again := r.Snapshot("c")
	if again[0].ID != "p1" {
		t.Fatalf("snapshot leaked: %s", again[0].ID)
	}
}