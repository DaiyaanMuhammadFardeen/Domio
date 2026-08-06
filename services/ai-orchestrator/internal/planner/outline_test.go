package planner

import (
	"context"
	"errors"
	"testing"

	"github.com/domio/platform/services/ai-orchestrator/internal/adapterclient"
)

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

type fakePromptFetcher struct {
	tmpl *adapterclient.PromptTemplate
	err  error
}

func (f *fakePromptFetcher) GetPrompt(_ context.Context, _ string, _ int32) (*adapterclient.PromptTemplate, error) {
	return f.tmpl, f.err
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

func TestBuildOutlineNilPlan(t *testing.T) {
	_, err := BuildOutline(context.Background(), nil, "", nil)
	if err == nil {
		t.Fatal("expected error for nil plan")
	}
}

func TestBuildOutlineHeuristicNoFetcher(t *testing.T) {
	plan := &Plan{
		Goal: "write a deck about Go",
		Subtasks: []Subtask{
			{ID: "parse", Title: "Parse requirements", Description: "Understand the goal", Category: CategoryAnalysis, Priority: 0},
			{ID: "outline", Title: "Create outline", Description: "Structure the deck", Category: CategoryGeneration, Priority: 1},
			{ID: "generate", Title: "Generate slides", Description: "Produce slide content", Category: CategoryGeneration, Priority: 2},
		},
	}

	outline, err := BuildOutline(context.Background(), nil, "", plan)
	if err != nil {
		t.Fatalf("BuildOutline: %v", err)
	}
	if len(outline.Slides) != 3 {
		t.Fatalf("len(Slides) = %d, want 3", len(outline.Slides))
	}

	// Verify heuristic confidence (0.6).
	for i, s := range outline.Slides {
		if s.Confidence != 0.6 {
			t.Errorf("slides[%d].Confidence = %f, want 0.6", i, s.Confidence)
		}
	}

	// Verify layout hints match categories.
	expectedHints := []string{"bullets", "content", "content"}
	for i, s := range outline.Slides {
		if s.LayoutHint != expectedHints[i] {
			t.Errorf("slides[%d].LayoutHint = %q, want %q", i, s.LayoutHint, expectedHints[i])
		}
	}

	// Verify content blocks come from descriptions.
	if outline.Slides[0].ContentBlocks[0] != "Understand the goal" {
		t.Errorf("slides[0].ContentBlocks = %v", outline.Slides[0].ContentBlocks)
	}
}

func TestBuildOutlineTemplateAssisted(t *testing.T) {
	plan := &Plan{
		Goal: "create a data presentation",
		Subtasks: []Subtask{
			{ID: "title", Title: "Title slide", Description: "Opening", Category: CategoryGeneration, Priority: 0},
			{ID: "data", Title: "Data overview", Description: "Key metrics", Category: CategoryAnalysis, Priority: 1},
			{ID: "visuals", Title: "Visual breakdown", Description: "Charts", Category: CategoryGeneration, Priority: 2},
		},
	}

	fetcher := &fakePromptFetcher{
		tmpl: &adapterclient.PromptTemplate{
			ID:                 "deck-v1",
			ModelClassHint:     "chart-generator",
			UserPromptTemplate: "Generate chart data for {{topic}}",
		},
	}

	outline, err := BuildOutline(context.Background(), fetcher, "deck-v1", plan)
	if err != nil {
		t.Fatalf("BuildOutline: %v", err)
	}
	if len(outline.Slides) != 3 {
		t.Fatalf("len(Slides) = %d, want 3", len(outline.Slides))
	}

	// Template-assisted confidence is 0.85.
	for i, s := range outline.Slides {
		if s.Confidence != 0.85 {
			t.Errorf("slides[%d].Confidence = %f, want 0.85", i, s.Confidence)
		}
	}

	// First slide is always "title" layout regardless of model class.
	if outline.Slides[0].LayoutHint != "title" {
		t.Errorf("slides[0].LayoutHint = %q, want title", outline.Slides[0].LayoutHint)
	}

	// Second slide (index=1) with "chart-generator" → "data-viz".
	if outline.Slides[1].LayoutHint != "data-viz" {
		t.Errorf("slides[1].LayoutHint = %q, want data-viz", outline.Slides[1].LayoutHint)
	}

	// Third slide (index=2) with "chart-generator" → "data-viz".
	if outline.Slides[2].LayoutHint != "data-viz" {
		t.Errorf("slides[2].LayoutHint = %q, want data-viz", outline.Slides[2].LayoutHint)
	}

	// Content blocks should include template hint.
	found := false
	for _, block := range outline.Slides[0].ContentBlocks {
		if containsSubstr(block, "[template:") {
			found = true
		}
	}
	if !found {
		t.Errorf("expected template hint in content blocks, got: %v", outline.Slides[0].ContentBlocks)
	}
}

func TestBuildOutlineFetcherFailsGracefully(t *testing.T) {
	plan := &Plan{
		Goal: "test",
		Subtasks: []Subtask{
			{ID: "s1", Title: "Step 1", Description: "Do stuff", Category: CategoryGeneration, Priority: 0},
		},
	}

	// Fetcher returns an error — should degrade to heuristic.
	fetcher := &fakePromptFetcher{err: errors.New("adapter not wired")}

	outline, err := BuildOutline(context.Background(), fetcher, "some-template", plan)
	if err != nil {
		t.Fatalf("BuildOutline should not error on fetch failure: %v", err)
	}
	if len(outline.Slides) != 1 {
		t.Fatalf("len(Slides) = %d, want 1", len(outline.Slides))
	}
	if outline.Slides[0].Confidence != 0.6 {
		t.Errorf("expected heuristic confidence 0.6, got %f", outline.Slides[0].Confidence)
	}
}

func TestBuildOutlineNilFetcherWithTemplateID(t *testing.T) {
	plan := &Plan{
		Goal: "test",
		Subtasks: []Subtask{
			{ID: "s1", Title: "Step 1", Description: "Do stuff", Category: CategoryGeneration, Priority: 0},
		},
	}

	// Nil fetcher but non-empty templateID — should degrade to heuristic.
	outline, err := BuildOutline(context.Background(), nil, "some-template", plan)
	if err != nil {
		t.Fatalf("BuildOutline: %v", err)
	}
	if len(outline.Slides) != 1 {
		t.Fatalf("len(Slides) = %d, want 1", len(outline.Slides))
	}
	if outline.Slides[0].Confidence != 0.6 {
		t.Errorf("expected heuristic confidence 0.6, got %f", outline.Slides[0].Confidence)
	}
}

func TestBuildOutlineEmptySubtasks(t *testing.T) {
	plan := &Plan{
		Goal:     "empty plan",
		Subtasks: []Subtask{},
	}

	outline, err := BuildOutline(context.Background(), nil, "", plan)
	if err != nil {
		t.Fatalf("BuildOutline: %v", err)
	}
	if len(outline.Slides) != 0 {
		t.Errorf("expected 0 slides for empty subtasks, got %d", len(outline.Slides))
	}
}

func TestLayoutHintForCategory(t *testing.T) {
	tests := []struct {
		cat  TaskCategory
		want string
	}{
		{CategoryGeneration, "content"},
		{CategoryAnalysis, "bullets"},
		{CategoryTransformation, "content"},
		{CategoryResearch, "bullets"},
		{TaskCategory("unknown"), "content"},
	}
	for _, tt := range tests {
		t.Run(string(tt.cat), func(t *testing.T) {
			got := layoutHintForCategory(tt.cat)
			if got != tt.want {
				t.Errorf("layoutHintForCategory(%q) = %q, want %q", tt.cat, got, tt.want)
			}
		})
	}
}

func TestLayoutHintFromModelClass(t *testing.T) {
	tests := []struct {
		modelClass string
		index      int
		want       string
	}{
		{"any", 0, "title"},                              // first slide always title
		{"chart-generator", 1, "data-viz"},               // chart class
		{"image-model", 2, "media"},                      // image class
		{"list-writer", 3, "bullets"},                    // list class
		{"general", 4, "content"},                        // default
		{"Chart-Visual", 5, "data-viz"},                  // case insensitive
	}
	for _, tt := range tests {
		t.Run(tt.modelClass+":"+itoa(tt.index), func(t *testing.T) {
			got := layoutHintFromModelClass(tt.modelClass, tt.index)
			if got != tt.want {
				t.Errorf("layoutHintFromModelClass(%q, %d) = %q, want %q",
					tt.modelClass, tt.index, got, tt.want)
			}
		})
	}
}

func TestTruncate(t *testing.T) {
	if got := truncate("hello", 10); got != "hello" {
		t.Errorf("truncate short: %q", got)
	}
	if got := truncate("hello world long string", 10); got != "hello wor…" {
		t.Errorf("truncate long: %q", got)
	}
	if got := truncate("exact", 5); got != "exact" {
		t.Errorf("truncate exact: %q", got)
	}
}

func TestBuildContentBlocks(t *testing.T) {
	st := Subtask{Title: "Step", Description: "Do things"}
	tmpl := &adapterclient.PromptTemplate{UserPromptTemplate: "Generate for {{topic}}"}
	blocks := buildContentBlocks(st, tmpl)
	if len(blocks) != 2 {
		t.Fatalf("len(blocks) = %d, want 2", len(blocks))
	}
	if blocks[0] != "Do things" {
		t.Errorf("blocks[0] = %q", blocks[0])
	}
	if blocks[1] != "[template: Generate for {{topic}}]" {
		t.Errorf("blocks[1] = %q", blocks[1])
	}
}

func TestBuildContentBlocksNoTemplate(t *testing.T) {
	st := Subtask{Title: "Step", Description: "Do things"}
	tmpl := &adapterclient.PromptTemplate{}
	blocks := buildContentBlocks(st, tmpl)
	if len(blocks) != 1 {
		t.Fatalf("len(blocks) = %d, want 1", len(blocks))
	}
	if blocks[0] != "Do things" {
		t.Errorf("blocks[0] = %q", blocks[0])
	}
}

func TestBuildContentBlocksEmptyDescription(t *testing.T) {
	st := Subtask{Title: "Fallback"}
	tmpl := &adapterclient.PromptTemplate{}
	blocks := buildContentBlocks(st, tmpl)
	if len(blocks) != 1 {
		t.Fatalf("len(blocks) = %d, want 1", len(blocks))
	}
	if blocks[0] != "Fallback" {
		t.Errorf("blocks[0] = %q, want Fallback", blocks[0])
	}
}

// itoa is a simple int-to-string for subtests (avoids strconv import).
func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	if n < 0 {
		return "-" + itoa(-n)
	}
	digits := ""
	for n > 0 {
		digits = string(rune('0'+n%10)) + digits
		n /= 10
	}
	return digits
}

// containsSubstr checks if s contains sub (reuses planner's internal helper).
func containsSubstr(s, sub string) bool {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
