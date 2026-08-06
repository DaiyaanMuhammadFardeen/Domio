package planner

import (
	"context"
	"errors"
	"testing"
)

func TestDecomposeGeneration(t *testing.T) {
	p := New(3)

	plan, err := p.Decompose(context.Background(), "write a blog post about Go concurrency", 0)
	if err != nil {
		t.Fatalf("Decompose: %v", err)
	}
	if plan.Goal != "write a blog post about Go concurrency" {
		t.Errorf("Goal = %q, want original goal", plan.Goal)
	}
	if len(plan.Subtasks) == 0 {
		t.Fatal("expected non-empty subtasks")
	}
	// Generation goals should produce subtasks with generation-related categories.
	found := false
	for _, st := range plan.Subtasks {
		if st.Category == CategoryGeneration {
			found = true
		}
	}
	if !found {
		t.Error("expected at least one Generation subtask")
	}
}

func TestDecomposeAnalysis(t *testing.T) {
	p := New(3)

	plan, err := p.Decompose(context.Background(), "analyze the codebase for security issues", 0)
	if err != nil {
		t.Fatalf("Decompose: %v", err)
	}
	if len(plan.Subtasks) == 0 {
		t.Fatal("expected non-empty subtasks")
	}
	found := false
	for _, st := range plan.Subtasks {
		if st.Category == CategoryAnalysis {
			found = true
		}
	}
	if !found {
		t.Error("expected at least one Analysis subtask")
	}
}

func TestDecomposeTransformation(t *testing.T) {
	p := New(3)

	plan, err := p.Decompose(context.Background(), "refactor the authentication module", 0)
	if err != nil {
		t.Fatalf("Decompose: %v", err)
	}
	if len(plan.Subtasks) == 0 {
		t.Fatal("expected non-empty subtasks")
	}
}

func TestDecomposeResearch(t *testing.T) {
	p := New(3)

	plan, err := p.Decompose(context.Background(), "research best practices for Go HTTP servers", 0)
	if err != nil {
		t.Fatalf("Decompose: %v", err)
	}
	if len(plan.Subtasks) == 0 {
		t.Fatal("expected non-empty subtasks")
	}
}

func TestDecomposeEmptyGoal(t *testing.T) {
	p := New(3)

	_, err := p.Decompose(context.Background(), "", 0)
	if !errors.Is(err, ErrEmptyGoal) {
		t.Errorf("err = %v, want ErrEmptyGoal", err)
	}
}

func TestDecomposeMaxDepth(t *testing.T) {
	p := New(2)

	// depth=2 equals maxDepth, so should return ErrMaxDepth.
	_, err := p.Decompose(context.Background(), "do something", 2)
	if !errors.Is(err, ErrMaxDepth) {
		t.Errorf("err = %v, want ErrMaxDepth", err)
	}
}

func TestDecomposeContextCancelled(t *testing.T) {
	p := New(3)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	_, err := p.Decompose(ctx, "do something", 0)
	if err == nil {
		t.Error("expected error for cancelled context")
	}
}

func TestDecomposeDefaultDepth(t *testing.T) {
	// maxDepth <= 0 should default to 3.
	p := New(0)

	// At depth 2, should still work (2 < 3).
	_, err := p.Decompose(context.Background(), "do something", 2)
	if err != nil {
		t.Errorf("err = %v, want nil", err)
	}
}

func TestDecomposeSubtaskDependencies(t *testing.T) {
	p := New(3)

	plan, err := p.Decompose(context.Background(), "generate a design document", 0)
	if err != nil {
		t.Fatalf("Decompose: %v", err)
	}

	// Verify subtasks have reasonable IDs.
	ids := make(map[string]bool)
	for _, st := range plan.Subtasks {
		if st.ID == "" {
			t.Error("subtask ID must not be empty")
		}
		if ids[st.ID] {
			t.Errorf("duplicate subtask ID: %s", st.ID)
		}
		ids[st.ID] = true
	}

	// Verify dependencies reference valid IDs.
	for _, st := range plan.Subtasks {
		for _, dep := range st.Dependencies {
			if !ids[dep] {
				t.Errorf("subtask %q depends on unknown ID %q", st.ID, dep)
			}
		}
	}
}

func TestClassifyGoal(t *testing.T) {
	tests := []struct {
		goal string
		want TaskCategory
	}{
		{"write a function", CategoryGeneration},
		{"create a new module", CategoryGeneration},
		{"analyze performance", CategoryAnalysis},
		{"review the code", CategoryAnalysis},
		{"refactor the handler", CategoryTransformation},
		{"migrate the database", CategoryTransformation},
		{"research web frameworks", CategoryResearch},
		{"investigate memory leaks", CategoryResearch},
		{"hello world", CategoryGeneration}, // default
	}

	for _, tt := range tests {
		t.Run(tt.goal, func(t *testing.T) {
			got := classifyGoal(tt.goal)
			if got != tt.want {
				t.Errorf("classifyGoal(%q) = %q, want %q", tt.goal, got, tt.want)
			}
		})
	}
}
