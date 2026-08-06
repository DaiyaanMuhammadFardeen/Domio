package store

import (
	"context"
	"encoding/json"
	"testing"
	"time"
)

func TestMemStoreCreateAndGetJob(t *testing.T) {
	ms := NewMemStore()
	ctx := context.Background()

	now := time.Now()
	job := &Job{
		ID:             "job-001",
		WorkspaceID:    "ws-1",
		RequestedBy:    "user-1",
		IdempotencyKey: "idem-001",
		JobType:        "deck.generate",
		Status:         StatusQueued,
		Payload:        json.RawMessage(`{"goal":"test"}`),
		Constraints:    json.RawMessage(`{}`),
		CostCents:      0,
		CreatedAt:      now,
		UpdatedAt:      now,
	}

	if err := ms.CreateJob(ctx, job); err != nil {
		t.Fatalf("CreateJob: %v", err)
	}

	got, err := ms.GetJob(ctx, "job-001")
	if err != nil {
		t.Fatalf("GetJob: %v", err)
	}
	if got.ID != "job-001" {
		t.Errorf("ID = %q, want job-001", got.ID)
	}
	if got.Status != StatusQueued {
		t.Errorf("Status = %q, want queued", got.Status)
	}
}

func TestMemStoreGetJobNotFound(t *testing.T) {
	ms := NewMemStore()
	_, err := ms.GetJob(context.Background(), "nonexistent")
	if err == nil {
		t.Fatal("expected error for nonexistent job")
	}
}

func TestMemStoreMarkJobRunning(t *testing.T) {
	ms := NewMemStore()
	ctx := context.Background()
	now := time.Now()

	job := &Job{ID: "j1", Status: StatusQueued, CreatedAt: now, UpdatedAt: now}
	_ = ms.CreateJob(ctx, job)

	if err := ms.MarkJobRunning(ctx, "j1"); err != nil {
		t.Fatalf("MarkJobRunning: %v", err)
	}

	got, _ := ms.GetJob(ctx, "j1")
	if got.Status != StatusRunning {
		t.Errorf("Status = %q, want running", got.Status)
	}
	if got.StartedAt == nil {
		t.Error("StartedAt should be set")
	}
}

func TestMemStoreMarkJobSucceeded(t *testing.T) {
	ms := NewMemStore()
	ctx := context.Background()
	now := time.Now()

	job := &Job{ID: "j1", Status: StatusRunning, CreatedAt: now, UpdatedAt: now}
	_ = ms.CreateJob(ctx, job)

	result := json.RawMessage(`{"output":"done"}`)
	if err := ms.MarkJobSucceeded(ctx, "j1", result); err != nil {
		t.Fatalf("MarkJobSucceeded: %v", err)
	}

	got, _ := ms.GetJob(ctx, "j1")
	if got.Status != StatusSucceeded {
		t.Errorf("Status = %q, want succeeded", got.Status)
	}
	if got.CompletedAt == nil {
		t.Error("CompletedAt should be set")
	}
}

func TestMemStoreMarkJobFailed(t *testing.T) {
	ms := NewMemStore()
	ctx := context.Background()
	now := time.Now()

	job := &Job{ID: "j1", Status: StatusRunning, CreatedAt: now, UpdatedAt: now}
	_ = ms.CreateJob(ctx, job)

	jobErr := json.RawMessage(`{"message":"timeout"}`)
	if err := ms.MarkJobFailed(ctx, "j1", jobErr); err != nil {
		t.Fatalf("MarkJobFailed: %v", err)
	}

	got, _ := ms.GetJob(ctx, "j1")
	if got.Status != StatusFailed {
		t.Errorf("Status = %q, want failed", got.Status)
	}
}

func TestMemStoreCreateRun(t *testing.T) {
	ms := NewMemStore()
	ctx := context.Background()

	run := &Run{
		ID:        "run-001",
		JobID:     "job-001",
		StepName:  "generate",
		Status:    "running",
		StartedAt: time.Now(),
	}

	if err := ms.CreateRun(ctx, run); err != nil {
		t.Fatalf("CreateRun: %v", err)
	}

	if len(ms.Runs) != 1 {
		t.Fatalf("len(Runs) = %d, want 1", len(ms.Runs))
	}
	if ms.Runs[0].StepName != "generate" {
		t.Errorf("StepName = %q, want generate", ms.Runs[0].StepName)
	}
}

func TestMemStoreMarkJobNotFound(t *testing.T) {
	ms := NewMemStore()
	ctx := context.Background()
	err := ms.MarkJobRunning(ctx, "nonexistent")
	if err == nil {
		t.Fatal("expected error for nonexistent job")
	}
}
