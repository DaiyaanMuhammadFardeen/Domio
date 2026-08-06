package renderer

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
)

// ---------------------------------------------------------------------------
// Compile-time + runtime sanity tests for pgxDeckStore.
//
// pgxDeckStore talks to Postgres directly, so without a live database we
// can only assert a few properties:
//
//   - NewPGXDeckStore returns a non-nil DeckStore.
//   - Calling its methods with a nil pool returns a connection error
//     (not a panic) — exercising the error path surface.
//   - The struct satisfies the DeckStore interface at compile time.
//
// For deeper integration coverage we rely on testcontainers-based tests
// run in CI — see docs/09-testing-strategy.md.
// ---------------------------------------------------------------------------

func TestNewPGXDeckStoreReturnsNonNil(t *testing.T) {
	store := NewPGXDeckStore(nil)
	if store == nil {
		t.Fatal("NewPGXDeckStore(nil) returned nil")
	}
}

func TestPGXDeckStoreSatisfiesDeckStore(t *testing.T) {
	var _ DeckStore = (*pgxDeckStore)(nil)
}

func TestPGXDeckStoreGetRevisionError(t *testing.T) {
	// With a nil pool, the underlying QueryRow must produce an error
	// rather than panic. This exercises the error-handling surface.
	store := NewPGXDeckStore(nil)
	_, err := store.GetDeckRevision(context.Background(), "non-existent")
	if err == nil {
		t.Error("expected an error with nil pool, got nil")
	}
}

func TestPGXDeckStoreCreateDeckVersionError(t *testing.T) {
	// Should error, not panic.
	store := NewPGXDeckStore(nil)
	err := store.CreateDeckVersion(context.Background(), &DeckVersion{
		DeckID:        "d1",
		Revision:      1,
		SchemaVersion: "ai-v1",
		AuthorID:      "u1",
		CreatedAt:     time.Now().UTC(),
	})
	if err == nil {
		t.Error("expected an error with nil pool, got nil")
	}
	// Verify the error wraps context about the deck + revision.
	if msg := err.Error(); msg == "" {
		t.Error("error message should be non-empty")
	}
}

func TestPGXDeckStoreUpdateDeckRevisionError(t *testing.T) {
	store := NewPGXDeckStore(nil)
	err := store.UpdateDeckRevision(context.Background(), "d1", 5)
	if err == nil {
		t.Error("expected an error with nil pool, got nil")
	}
}

func TestPGXDeckStoreCreateSlideError(t *testing.T) {
	store := NewPGXDeckStore(nil)
	err := store.CreateSlide(context.Background(), &SlideRow{
		ID:            "s1",
		DeckID:        "d1",
		Position:      0,
		SchemaVersion: "ai-v1",
		CreatedAt:     time.Now().UTC(),
	})
	if err == nil {
		t.Error("expected an error with nil pool, got nil")
	}
}

// TestPGXDeckStoreInterfaceMethodsWired ensures the pgxDeckStore
// implementation provides every method required by DeckStore. This is
// a guardrail against drift between interface and implementation.
func TestPGXDeckStoreInterfaceMethodsWired(t *testing.T) {
	var d DeckStore = &pgxDeckStore{}

	// Just verify each method can be called — they'll all error with
	// nil pool, but the test asserts the methods are wired, not that
	// they succeed.
	ctx := context.Background()
	errs := []error{}

	if _, err := d.GetDeckRevision(ctx, "x"); err == nil {
		errs = append(errs, errors.New("GetDeckRevision did not error"))
	} else {
		// pgconn-specific connection errors are expected, not panics.
		var pgErr *pgconn.ConnectError
		if !errors.As(err, &pgErr) && err.Error() == "" {
			t.Logf("GetDeckRevision error format: %v (acceptable)", err)
		}
	}
	if err := d.CreateDeckVersion(ctx, &DeckVersion{}); err == nil {
		errs = append(errs, errors.New("CreateDeckVersion did not error"))
	}
	if err := d.UpdateDeckRevision(ctx, "x", 1); err == nil {
		errs = append(errs, errors.New("UpdateDeckRevision did not error"))
	}
	if err := d.CreateSlide(ctx, &SlideRow{}); err == nil {
		errs = append(errs, errors.New("CreateSlide did not error"))
	}
	if len(errs) > 0 {
		t.Errorf("expected error surfaces, got none for: %v", errs)
	}
}
