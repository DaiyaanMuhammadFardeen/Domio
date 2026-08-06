package renderer

import (
	"context"
	"testing"

	"github.com/domio/platform/services/ai-orchestrator/internal/planner"
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

var testIDCounter int

func testIDGen() string {
	testIDCounter++
	return "slide-" + itoa(testIDCounter)
}

func resetTestIDCounter() {
	testIDCounter = 0
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	digits := ""
	for n > 0 {
		digits = string(rune('0'+n%10)) + digits
		n /= 10
	}
	return digits
}

func testOutline() *planner.Outline {
	return &planner.Outline{
		Slides: []planner.OutlineSlide{
			{
				Intent:        "Title",
				LayoutHint:    "title",
				ContentBlocks: []string{"Welcome"},
				Confidence:    0.9,
			},
			{
				Intent:        "Data overview",
				LayoutHint:    "data-viz",
				ContentBlocks: []string{"Key metrics"},
				DataBindings:  []planner.DataBinding{{SourceRef: "sheet-1", ChartType: "bar"}},
				Confidence:    0.85,
			},
			{
				Intent:        "Closing",
				LayoutHint:    "content",
				ContentBlocks: []string{"Thank you"},
				CitationRefs:  []string{"cit-1", "cit-2"},
				Confidence:    0.8,
			},
		},
	}
}

// ---------------------------------------------------------------------------
// Tests: Render
// ---------------------------------------------------------------------------

func TestRenderSuccess(t *testing.T) {
	resetTestIDCounter()
	store := NewMemDeckStore()
	rdr := NewDeckRenderer(store, testIDGen)
	ctx := context.Background()

	req := RenderRequest{
		DeckID:   "deck-1",
		AuthorID: "user-1",
		BranchID: "main",
		Outline:  testOutline(),
	}

	result, err := rdr.Render(ctx, req)
	if err != nil {
		t.Fatalf("Render: %v", err)
	}

	if result.DeckID != "deck-1" {
		t.Errorf("DeckID = %q, want deck-1", result.DeckID)
	}
	if result.Revision != 1 {
		t.Errorf("Revision = %d, want 1", result.Revision)
	}
	if len(result.SlideIDs) != 3 {
		t.Fatalf("len(SlideIDs) = %d, want 3", len(result.SlideIDs))
	}
	if result.Version == nil {
		t.Fatal("Version must not be nil")
	}

	// Verify deck_versions row.
	if len(store.Versions) != 1 {
		t.Fatalf("len(Versions) = %d, want 1", len(store.Versions))
	}
	v := store.Versions[0]
	if v.DeckID != "deck-1" {
		t.Errorf("version.DeckID = %q", v.DeckID)
	}
	if v.Revision != 1 {
		t.Errorf("version.Revision = %d", v.Revision)
	}
	if v.ParentRevision != nil {
		t.Errorf("version.ParentRevision should be nil for first version, got %v", v.ParentRevision)
	}
	if v.AuthorID != "user-1" {
		t.Errorf("version.AuthorID = %q", v.AuthorID)
	}
	if v.SchemaVersion != "ai-v1" {
		t.Errorf("version.SchemaVersion = %q", v.SchemaVersion)
	}
	if v.BranchID == nil || *v.BranchID != "main" {
		t.Errorf("version.BranchID = %v, want main", v.BranchID)
	}
	if v.DiffObjectKey != nil {
		t.Errorf("version.DiffObjectKey should be nil, got %v", v.DiffObjectKey)
	}

	// Verify slides.
	if len(store.Slides) != 3 {
		t.Fatalf("len(Slides) = %d, want 3", len(store.Slides))
	}
	for i, s := range store.Slides {
		if s.DeckID != "deck-1" {
			t.Errorf("slides[%d].DeckID = %q", i, s.DeckID)
		}
		if s.Position != i {
			t.Errorf("slides[%d].Position = %d, want %d", i, s.Position, i)
		}
		if s.SchemaVersion != "ai-v1" {
			t.Errorf("slides[%d].SchemaVersion = %q", i, s.SchemaVersion)
		}
	}

	// Verify deck revision updated.
	rev := store.Revisions["deck-1"]
	if rev != 1 {
		t.Errorf("deck revision = %d, want 1", rev)
	}
}

func TestRenderVersionIncrement(t *testing.T) {
	resetTestIDCounter()
	store := NewMemDeckStore()
	rdr := NewDeckRenderer(store, testIDGen)
	ctx := context.Background()

	outline := &planner.Outline{
		Slides: []planner.OutlineSlide{
			{Intent: "S1", LayoutHint: "content", ContentBlocks: []string{"A"}},
		},
	}

	// First render → revision 1.
	r1, err := rdr.Render(ctx, RenderRequest{
		DeckID:   "deck-2",
		AuthorID: "user-1",
		Outline:  outline,
	})
	if err != nil {
		t.Fatalf("Render 1: %v", err)
	}
	if r1.Revision != 1 {
		t.Errorf("r1.Revision = %d, want 1", r1.Revision)
	}

	// Second render → revision 2.
	r2, err := rdr.Render(ctx, RenderRequest{
		DeckID:   "deck-2",
		AuthorID: "user-1",
		Outline:  outline,
	})
	if err != nil {
		t.Fatalf("Render 2: %v", err)
	}
	if r2.Revision != 2 {
		t.Errorf("r2.Revision = %d, want 2", r2.Revision)
	}

	// Verify parent_revision set correctly.
	if store.Versions[1].ParentRevision == nil {
		t.Fatal("second version should have parent_revision")
	}
	if *store.Versions[1].ParentRevision != 1 {
		t.Errorf("parent_revision = %d, want 1", *store.Versions[1].ParentRevision)
	}

	// Verify deck revision updated.
	if store.Revisions["deck-2"] != 2 {
		t.Errorf("deck revision = %d, want 2", store.Revisions["deck-2"])
	}
}

func TestRenderMissingDeckID(t *testing.T) {
	store := NewMemDeckStore()
	rdr := NewDeckRenderer(store, nil)
	_, err := rdr.Render(context.Background(), RenderRequest{
		AuthorID: "u1",
		Outline:  &planner.Outline{},
	})
	if err == nil {
		t.Fatal("expected error for missing deck_id")
	}
}

func TestRenderMissingAuthorID(t *testing.T) {
	store := NewMemDeckStore()
	rdr := NewDeckRenderer(store, nil)
	_, err := rdr.Render(context.Background(), RenderRequest{
		DeckID: "d1",
		Outline: &planner.Outline{},
	})
	if err == nil {
		t.Fatal("expected error for missing author_id")
	}
}

func TestRenderMissingOutline(t *testing.T) {
	store := NewMemDeckStore()
	rdr := NewDeckRenderer(store, nil)
	_, err := rdr.Render(context.Background(), RenderRequest{
		DeckID:   "d1",
		AuthorID: "u1",
	})
	if err == nil {
		t.Fatal("expected error for missing outline")
	}
}

func TestRenderEmptyOutline(t *testing.T) {
	store := NewMemDeckStore()
	rdr := NewDeckRenderer(store, testIDGen)
	ctx := context.Background()

	result, err := rdr.Render(ctx, RenderRequest{
		DeckID:   "deck-empty",
		AuthorID: "user-1",
		Outline:  &planner.Outline{Slides: []planner.OutlineSlide{}},
	})
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	if len(result.SlideIDs) != 0 {
		t.Errorf("expected 0 slide IDs, got %d", len(result.SlideIDs))
	}
}

func TestRenderDefaultSchemaVersion(t *testing.T) {
	store := NewMemDeckStore()
	rdr := NewDeckRenderer(store, testIDGen)
	ctx := context.Background()

	result, err := rdr.Render(ctx, RenderRequest{
		DeckID:   "deck-sv",
		AuthorID: "user-1",
		Outline:  &planner.Outline{Slides: []planner.OutlineSlide{{Intent: "S1", ContentBlocks: []string{"x"}}}},
	})
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	if result.Version.SchemaVersion != "ai-v1" {
		t.Errorf("SchemaVersion = %q, want ai-v1", result.Version.SchemaVersion)
	}
}

func TestRenderDefaultBranch(t *testing.T) {
	store := NewMemDeckStore()
	rdr := NewDeckRenderer(store, testIDGen)
	ctx := context.Background()

	result, err := rdr.Render(ctx, RenderRequest{
		DeckID:   "deck-br",
		AuthorID: "user-1",
		Outline:  &planner.Outline{Slides: []planner.OutlineSlide{{Intent: "S1", ContentBlocks: []string{"x"}}}},
	})
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	if result.Version.BranchID == nil || *result.Version.BranchID != "main" {
		t.Errorf("BranchID = %v, want main", result.Version.BranchID)
	}
}

// ---------------------------------------------------------------------------
// Tests: Content transforms (RTL + layout check)
// ---------------------------------------------------------------------------

func TestTransformSlideContentLTR(t *testing.T) {
	slide := planner.OutlineSlide{
		Intent:        "Revenue",
		LayoutHint:    "bullets",
		ContentBlocks: []string{"Point A", "Point B"},
		Confidence:    0.9,
	}

	out := TransformSlideContent(slide, RTLContext{IsRTL: false, Direction: "ltr"})

	if out.LayoutHint != "bullets" {
		t.Errorf("LayoutHint = %q, want bullets", out.LayoutHint)
	}
	if out.ContentBlocks[0] != "Point A" {
		t.Errorf("ContentBlocks[0] = %q", out.ContentBlocks[0])
	}
	if out.ContentBlocks[1] != "Point B" {
		t.Errorf("ContentBlocks[1] = %q", out.ContentBlocks[1])
	}
}

func TestTransformSlideContentRTL(t *testing.T) {
	slide := planner.OutlineSlide{
		Intent:        "Revenue",
		LayoutHint:    "bullets",
		ContentBlocks: []string{"Point A", "Point B"},
		Confidence:    0.9,
	}

	out := TransformSlideContent(slide, RTLContext{IsRTL: true, Direction: "rtl"})

	if out.LayoutHint != "rtl-bullets" {
		t.Errorf("LayoutHint = %q, want rtl-bullets", out.LayoutHint)
	}
	if out.ContentBlocks[0] != "[RTL] Point A" {
		t.Errorf("ContentBlocks[0] = %q", out.ContentBlocks[0])
	}
	if out.ContentBlocks[1] != "[RTL] Point B" {
		t.Errorf("ContentBlocks[1] = %q", out.ContentBlocks[1])
	}
}

func TestTransformSlideContentRTLContentLayout(t *testing.T) {
	slide := planner.OutlineSlide{
		LayoutHint:    "content",
		ContentBlocks: []string{"Hello"},
	}

	out := TransformSlideContent(slide, RTLContext{IsRTL: true})
	if out.LayoutHint != "rtl-content" {
		t.Errorf("LayoutHint = %q, want rtl-content", out.LayoutHint)
	}
}

func TestTransformSlideContentRTLDataVizLayout(t *testing.T) {
	slide := planner.OutlineSlide{
		LayoutHint:    "data-viz",
		ContentBlocks: []string{"Chart"},
	}

	out := TransformSlideContent(slide, RTLContext{IsRTL: true})
	if out.LayoutHint != "rtl-data-viz" {
		t.Errorf("LayoutHint = %q, want rtl-data-viz", out.LayoutHint)
	}
}

func TestTransformSlideContentRTLUnknownLayout(t *testing.T) {
	slide := planner.OutlineSlide{
		LayoutHint:    "custom-layout",
		ContentBlocks: []string{"Hello"},
	}

	out := TransformSlideContent(slide, RTLContext{IsRTL: true})
	if out.LayoutHint != "custom-layout" {
		t.Errorf("LayoutHint = %q, want custom-layout (unchanged)", out.LayoutHint)
	}
}

func TestTransformSlideContentPreservesDataBindings(t *testing.T) {
	slide := planner.OutlineSlide{
		LayoutHint:    "data-viz",
		ContentBlocks: []string{"Chart"},
		DataBindings:  []planner.DataBinding{{SourceRef: "s1", ChartType: "bar"}},
		CitationRefs:  []string{"c1"},
		Confidence:    0.8,
	}

	out := TransformSlideContent(slide, RTLContext{IsRTL: true})
	if len(out.DataBindings) != 1 || out.DataBindings[0].ChartType != "bar" {
		t.Errorf("DataBindings lost: %v", out.DataBindings)
	}
	if len(out.CitationRefs) != 1 || out.CitationRefs[0] != "c1" {
		t.Errorf("CitationRefs lost: %v", out.CitationRefs)
	}
	if out.Confidence != 0.8 {
		t.Errorf("Confidence = %f, want 0.8", out.Confidence)
	}
}

// ---------------------------------------------------------------------------
// Tests: Image fallback + moderation
// ---------------------------------------------------------------------------

func TestEvaluateImageFallbackNoURL(t *testing.T) {
	result := EvaluateImageFallback("", nil)
	if !result.UsedFallback {
		t.Error("expected UsedFallback=true when URL empty")
	}
	if result.ModerationOK {
		t.Error("expected ModerationOK=false when no URL")
	}
	if result.FallbackURL != "https://cdn.domio.io/placeholder.png" {
		t.Errorf("FallbackURL = %q", result.FallbackURL)
	}
}

func TestEvaluateImageFallbackBlocked(t *testing.T) {
	result := EvaluateImageFallback(
		"https://example.com/image.png",
		map[string]interface{}{"blocked": true, "reason": "nsfw content"},
	)
	if !result.UsedFallback {
		t.Error("expected UsedFallback=true when blocked")
	}
	if result.ModerationOK {
		t.Error("expected ModerationOK=false when blocked")
	}
	if result.ModerationReason != "nsfw content" {
		t.Errorf("ModerationReason = %q", result.ModerationReason)
	}
}

func TestEvaluateImageFallbackOK(t *testing.T) {
	result := EvaluateImageFallback("https://example.com/good.png", nil)
	if result.UsedFallback {
		t.Error("expected UsedFallback=false")
	}
	if !result.ModerationOK {
		t.Error("expected ModerationOK=true")
	}
	if result.PrimaryURL != "https://example.com/good.png" {
		t.Errorf("PrimaryURL = %q", result.PrimaryURL)
	}
}

func TestEvaluateImageFallbackNotBlocked(t *testing.T) {
	result := EvaluateImageFallback(
		"https://example.com/image.png",
		map[string]interface{}{"blocked": false},
	)
	if result.UsedFallback {
		t.Error("expected UsedFallback=false when not blocked")
	}
}

func TestIsModerationBlocked(t *testing.T) {
	tests := []struct {
		prompt string
		want   bool
	}{
		{"a beautiful sunset", false},
		{"show me violence", true},
		{"gore effects", true},
		{"NSFW content", true},
		{"explicit material", true},
		{"", false},
	}
	for _, tt := range tests {
		t.Run(tt.prompt, func(t *testing.T) {
			got := IsModerationBlocked(tt.prompt)
			if got != tt.want {
				t.Errorf("IsModerationBlocked(%q) = %v, want %v", tt.prompt, got, tt.want)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// Tests: Citations coverage math
// ---------------------------------------------------------------------------

func TestCitationCoverageNilOutline(t *testing.T) {
	if got := CitationCoverage(nil); got != 0.0 {
		t.Errorf("CitationCoverage(nil) = %f, want 0.0", got)
	}
}

func TestCitationCoverageEmptySlides(t *testing.T) {
	o := &planner.Outline{Slides: []planner.OutlineSlide{}}
	if got := CitationCoverage(o); got != 0.0 {
		t.Errorf("CitationCoverage(empty) = %f, want 0.0", got)
	}
}

func TestCitationCoverageAllCited(t *testing.T) {
	o := &planner.Outline{
		Slides: []planner.OutlineSlide{
			{CitationRefs: []string{"c1"}},
			{CitationRefs: []string{"c2"}},
			{CitationRefs: []string{"c3"}},
		},
	}
	if got := CitationCoverage(o); got != 1.0 {
		t.Errorf("CitationCoverage(all) = %f, want 1.0", got)
	}
}

func TestCitationCoverageNoneCited(t *testing.T) {
	o := &planner.Outline{
		Slides: []planner.OutlineSlide{
			{ContentBlocks: []string{"A"}},
			{ContentBlocks: []string{"B"}},
		},
	}
	if got := CitationCoverage(o); got != 0.0 {
		t.Errorf("CitationCoverage(none) = %f, want 0.0", got)
	}
}

func TestCitationCoveragePartial(t *testing.T) {
	o := &planner.Outline{
		Slides: []planner.OutlineSlide{
			{CitationRefs: []string{"c1"}},
			{ContentBlocks: []string{"uncited"}},
			{CitationRefs: []string{"c2"}},
		},
	}
	got := CitationCoverage(o)
	// 2/3 = 0.6666...
	if got < 0.66 || got > 0.67 {
		t.Errorf("CitationCoverage(partial) = %f, want ~0.667", got)
	}
}

// ---------------------------------------------------------------------------
// Tests: VersionIncrement
// ---------------------------------------------------------------------------

func TestVersionIncrement(t *testing.T) {
	tests := []struct {
		current int64
		want    int64
	}{
		{0, 1},
		{1, 2},
		{42, 43},
		{100, 101},
	}
	for _, tt := range tests {
		t.Run(itoa(int(tt.current)), func(t *testing.T) {
			got := VersionIncrement(tt.current)
			if got != tt.want {
				t.Errorf("VersionIncrement(%d) = %d, want %d", tt.current, got, tt.want)
			}
		})
	}
}
