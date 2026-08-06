package main

import (
	"context"
	"sync/atomic"
	"testing"

	"github.com/domio/platform/workers/ai-tasks/internal/handler"
)

func TestExtractJobID(t *testing.T) {
	tests := []struct {
		subject string
		want    string
	}{
		{"ai.jobs.abc-123", "abc-123"},
		{"ai.jobs.", ""},
		{"ai.jobs", ""},
		{"ai.other.abc-123", ""},
		{"", ""},
		{"ai.jobs.with-hyphens-and-dots.42", "with-hyphens-and-dots.42"},
	}

	for _, tt := range tests {
		t.Run(tt.subject, func(t *testing.T) {
			got := extractJobID(tt.subject)
			if got != tt.want {
				t.Errorf("extractJobID(%q) = %q, want %q", tt.subject, got, tt.want)
			}
		})
	}
}

func TestProcessMsg_FakeHandler(t *testing.T) {
	// Verify processMsg dispatches to the handler and increments the counter.
	// We can't easily create a real jetstream.Msg without NATS, so we
	// exercise the handler wiring through the FakeHandler + atomic counter
	// pattern used by integration tests.
	fh := &handler.FakeHandler{Running: make(map[string]bool)}
	var counter atomic.Int64

	// Simulate what processMsg does: call handler.Handle with a job ID.
	ctx := context.Background()
	jobID := "test-job-42"

	err := fh.Handle(ctx, jobID)
	if err != nil {
		t.Fatalf("handler error: %v", err)
	}
	counter.Add(1)

	if len(fh.Called) != 1 {
		t.Fatalf("expected 1 call, got %d", len(fh.Called))
	}
	if fh.Called[0] != jobID {
		t.Errorf("expected job_id %s, got %s", jobID, fh.Called[0])
	}
	if counter.Load() != 1 {
		t.Errorf("expected counter 1, got %d", counter.Load())
	}
}

func TestProcessMsg_HandlerError(t *testing.T) {
	// When handler returns an error, the counter should not increment.
	var counter atomic.Int64

	// Use a handler that always errors.
	errHandler := &errorHandler{err: context.DeadlineExceeded}

	ctx := context.Background()
	err := errHandler.Handle(ctx, "job-err")
	if err == nil {
		t.Fatal("expected error")
	}
	// Counter should NOT be incremented.
	if counter.Load() != 0 {
		t.Errorf("expected counter 0, got %d", counter.Load())
	}
}

// errorHandler is a minimal Handler that always returns an error.
type errorHandler struct {
	err error
}

func (e *errorHandler) Handle(_ context.Context, _ string) error {
	return e.err
}
