// Package handler implements the AI job processing logic.
//
// The Handler interface allows the consumer to be tested independently
// of the underlying execution engine. For M1, StubHandler marks the
// job as succeeded immediately.
package handler

import (
	"context"
	"fmt"

	"go.uber.org/zap"

	"github.com/domio/platform/workers/ai-tasks/internal/store"
)

// ---------------------------------------------------------------------------
// Handler — abstracts job execution for testability.
// ---------------------------------------------------------------------------

// Handler processes a single AI job. Implementations must be safe for
// concurrent use.
type Handler interface {
	// Handle processes the job identified by jobID. On success the
	// handler should have transitioned the job to a terminal state.
	Handle(ctx context.Context, jobID string) error
}

// ---------------------------------------------------------------------------
// StubHandler — M1 implementation that marks jobs as succeeded.
// ---------------------------------------------------------------------------

// StubHandler marks a job as succeeded. Real executor wiring is M2.
type StubHandler struct {
	store  store.Store
	logger *zap.Logger
}

// NewStubHandler returns a StubHandler backed by the given store.
func NewStubHandler(s store.Store, logger *zap.Logger) *StubHandler {
	return &StubHandler{store: s, logger: logger}
}

// Handle marks the job as running, then immediately as succeeded.
// This is the M1 stub; the real handler will delegate to an executor.
func (h *StubHandler) Handle(ctx context.Context, jobID string) error {
	h.logger.Info("handler: processing job", zap.String("job_id", jobID))

	if err := h.store.MarkJobRunning(ctx, jobID); err != nil {
		return fmt.Errorf("mark running: %w", err)
	}

	// M1 stub: mark succeeded immediately.
	// Real executor wiring happens in M2.
	if err := h.store.MarkJobSucceeded(ctx, jobID); err != nil {
		return fmt.Errorf("mark succeeded: %w", err)
	}

	h.logger.Info("handler: job succeeded", zap.String("job_id", jobID))
	return nil
}

// ---------------------------------------------------------------------------
// FakeHandler — for testing consumer wiring.
// ---------------------------------------------------------------------------

// FakeHandler records calls for test assertions.
type FakeHandler struct {
	Called  []string
	Err     error
	Running map[string]bool
}

// Handle records the jobID and optionally returns a configured error.
func (f *FakeHandler) Handle(_ context.Context, jobID string) error {
	f.Called = append(f.Called, jobID)
	if f.Running != nil {
		f.Running[jobID] = true
	}
	return f.Err
}
