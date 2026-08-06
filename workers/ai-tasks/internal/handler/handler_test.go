package handler

import (
	"context"
	"errors"
	"testing"

	"github.com/domio/platform/workers/ai-tasks/internal/store"
	"go.uber.org/zap"
)

func TestStubHandler_Handle(t *testing.T) {
	ms := store.NewMemStore()
	ms.Jobs["job-1"] = &store.Job{
		ID:     "job-1",
		Status: store.StatusPending,
	}
	logger := zap.NewNop()
	h := NewStubHandler(ms, logger)

	err := h.Handle(context.Background(), "job-1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	j, err := ms.GetJob(context.Background(), "job-1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if j.Status != store.StatusSucceeded {
		t.Errorf("expected status succeeded, got %s", j.Status)
	}
}

func TestStubHandler_HandleNotFound(t *testing.T) {
	ms := store.NewMemStore()
	logger := zap.NewNop()
	h := NewStubHandler(ms, logger)

	err := h.Handle(context.Background(), "nonexistent")
	if err == nil {
		t.Fatal("expected error for nonexistent job")
	}
}

func TestFakeHandler_CallsRecorded(t *testing.T) {
	fh := &FakeHandler{Running: make(map[string]bool)}
	ctx := context.Background()

	err := fh.Handle(ctx, "job-100")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	err = fh.Handle(ctx, "job-200")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(fh.Called) != 2 {
		t.Fatalf("expected 2 calls, got %d", len(fh.Called))
	}
	if fh.Called[0] != "job-100" || fh.Called[1] != "job-200" {
		t.Errorf("unexpected calls: %v", fh.Called)
	}
	if !fh.Running["job-100"] || !fh.Running["job-200"] {
		t.Error("expected both jobs in Running map")
	}
}

func TestFakeHandler_ErrorPropagation(t *testing.T) {
	fh := &FakeHandler{Err: errors.New("boom")}
	err := fh.Handle(context.Background(), "job-300")
	if err == nil || err.Error() != "boom" {
		t.Errorf("expected 'boom', got %v", err)
	}
	if len(fh.Called) != 1 {
		t.Errorf("expected 1 call even on error, got %d", len(fh.Called))
	}
}
