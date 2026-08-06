package store

import (
	"context"
	"testing"
	"time"
)

func TestMemStore_MarkJobRunning(t *testing.T) {
	ms := NewMemStore()
	ms.Jobs["j1"] = &Job{ID: "j1", Status: StatusPending}

	err := ms.MarkJobRunning(context.Background(), "j1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ms.Jobs["j1"].Status != StatusRunning {
		t.Errorf("expected running, got %s", ms.Jobs["j1"].Status)
	}
}

func TestMemStore_MarkJobSucceeded(t *testing.T) {
	ms := NewMemStore()
	ms.Jobs["j1"] = &Job{ID: "j1", Status: StatusRunning}

	err := ms.MarkJobSucceeded(context.Background(), "j1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ms.Jobs["j1"].Status != StatusSucceeded {
		t.Errorf("expected succeeded, got %s", ms.Jobs["j1"].Status)
	}
}

func TestMemStore_GetJob(t *testing.T) {
	ms := NewMemStore()
	now := time.Now()
	ms.Jobs["j1"] = &Job{
		ID:        "j1",
		JobType:   "outline.from_prompt",
		Status:    StatusPending,
		CreatedAt: now,
		UpdatedAt: now,
	}

	j, err := ms.GetJob(context.Background(), "j1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if j.ID != "j1" {
		t.Errorf("expected id j1, got %s", j.ID)
	}
	if j.JobType != "outline.from_prompt" {
		t.Errorf("expected job_type outline.from_prompt, got %s", j.JobType)
	}
}

func TestMemStore_GetJobNotFound(t *testing.T) {
	ms := NewMemStore()
	_, err := ms.GetJob(context.Background(), "nonexistent")
	if err == nil {
		t.Fatal("expected error for nonexistent job")
	}
}

func TestMemStore_MarkJobNotFound(t *testing.T) {
	ms := NewMemStore()
	err := ms.MarkJobRunning(context.Background(), "nonexistent")
	if err == nil {
		t.Fatal("expected error for nonexistent job")
	}
	err = ms.MarkJobSucceeded(context.Background(), "nonexistent")
	if err == nil {
		t.Fatal("expected error for nonexistent job")
	}
}

func TestMemStore_FullLifecycle(t *testing.T) {
	ms := NewMemStore()
	ms.Jobs["lifecycle"] = &Job{ID: "lifecycle", Status: StatusPending}
	ctx := context.Background()

	// pending -> running
	if err := ms.MarkJobRunning(ctx, "lifecycle"); err != nil {
		t.Fatalf("MarkJobRunning: %v", err)
	}
	j, _ := ms.GetJob(ctx, "lifecycle")
	if j.Status != StatusRunning {
		t.Errorf("expected running, got %s", j.Status)
	}

	// running -> succeeded
	if err := ms.MarkJobSucceeded(ctx, "lifecycle"); err != nil {
		t.Fatalf("MarkJobSucceeded: %v", err)
	}
	j, _ = ms.GetJob(ctx, "lifecycle")
	if j.Status != StatusSucceeded {
		t.Errorf("expected succeeded, got %s", j.Status)
	}
}
