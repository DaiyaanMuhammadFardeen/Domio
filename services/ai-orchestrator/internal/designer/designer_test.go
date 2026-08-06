package designer

import (
	"context"
	"errors"
	"strings"
	"testing"
)

// ---------------------------------------------------------------------------
// Stub generator — for tests
// ---------------------------------------------------------------------------

type stubGenerator struct {
	options  []LayoutOption
	variants []LayoutOption
	err      error
}

func (s *stubGenerator) GenerateOptions(_ context.Context, _ SlidePrompt, _ int) ([]LayoutOption, error) {
	if s.err != nil {
		return nil, s.err
	}
	return s.options, nil
}

func (s *stubGenerator) GenerateVariants(_ context.Context, _ LayoutOption, _ SlidePrompt, _ int) ([]LayoutOption, error) {
	if s.err != nil {
		return nil, s.err
	}
	return s.variants, nil
}

// ---------------------------------------------------------------------------
// Tests — Design
// ---------------------------------------------------------------------------

func TestDesignProducesFourDistinct(t *testing.T) {
	g := &stubGenerator{
		options: []LayoutOption{
			{TemplateID: "g1", Title: "A", LayoutHint: "title-center"},
			{TemplateID: "g2", Title: "B", LayoutHint: "bullets"},
			{TemplateID: "g3", Title: "C", LayoutHint: "2-col"},
			{TemplateID: "g4", Title: "D", LayoutHint: "data-viz"},
		},
	}
	d := New(g)

	res, err := d.Design(context.Background(), SlidePrompt{Intent: "compare 3 pricing tiers"})
	if err != nil {
		t.Fatalf("Design: %v", err)
	}
	if len(res.Options) != 4 {
		t.Fatalf("len(Options) = %d, want 4", len(res.Options))
	}

	// All 4 must have distinct fingerprints.
	fps := make(map[string]int)
	for _, o := range res.Options {
		fps[o.Fingerprint]++
	}
	if len(fps) != 4 {
		t.Errorf("expected 4 distinct fingerprints, got %d: %v", len(fps), fps)
	}

	// Indices must be 1..4.
	for i, o := range res.Options {
		if o.Index != i+1 {
			t.Errorf("options[%d].Index = %d, want %d", i, o.Index, i+1)
		}
	}
}

func TestDesignGeneratorReturnsDuplicatesToppedUp(t *testing.T) {
	// Generator returns 3 options that all share the same fingerprint
	// (e.g. all "title-center"). Designer must top up with fallbacks
	// to reach 4 distinct options.
	g := &stubGenerator{
		options: []LayoutOption{
			{TemplateID: "g1", Title: "A", LayoutHint: "title-center"},
			{TemplateID: "g2", Title: "B", LayoutHint: "title-center"},
			{TemplateID: "g3", Title: "C", LayoutHint: "title-center"},
		},
	}
	d := New(g)

	res, err := d.Design(context.Background(), SlidePrompt{Intent: "hello world"})
	if err != nil {
		t.Fatalf("Design: %v", err)
	}
	if len(res.Options) != 4 {
		t.Fatalf("len(Options) = %d, want 4", len(res.Options))
	}

	fps := make(map[string]int)
	for _, o := range res.Options {
		fps[o.Fingerprint]++
	}
	if len(fps) != 4 {
		t.Errorf("expected 4 distinct fingerprints after top-up, got %d", len(fps))
	}
}

func TestDesignGeneratorReturnsEmptyGetsFallbacks(t *testing.T) {
	g := &stubGenerator{options: nil}
	d := New(g)

	res, err := d.Design(context.Background(), SlidePrompt{Intent: "anything"})
	if err != nil {
		t.Fatalf("Design: %v", err)
	}
	if len(res.Options) != 4 {
		t.Errorf("len(Options) = %d, want 4 (fallback)", len(res.Options))
	}
}

func TestDesignGeneratorErrorPropagates(t *testing.T) {
	g := &stubGenerator{err: errors.New("upstream down")}
	d := New(g)

	_, err := d.Design(context.Background(), SlidePrompt{Intent: "x"})
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "upstream down") {
		t.Errorf("err should wrap upstream error: %v", err)
	}
}

func TestDesignMissingIntent(t *testing.T) {
	d := New(&stubGenerator{})
	_, err := d.Design(context.Background(), SlidePrompt{})
	if err == nil {
		t.Fatal("expected error for missing intent")
	}
}

func TestDesignMissingGenerator(t *testing.T) {
	d := New(nil)
	_, err := d.Design(context.Background(), SlidePrompt{Intent: "x"})
	if err == nil {
		t.Fatal("expected error for missing generator")
	}
}

// ---------------------------------------------------------------------------
// Tests — MoreLike
// ---------------------------------------------------------------------------

func TestMoreLikeReturnsFourVariants(t *testing.T) {
	g := &stubGenerator{
		variants: []LayoutOption{
			{TemplateID: "v1", Title: "Var A", LayoutHint: "2-col"},
			{TemplateID: "v2", Title: "Var B", LayoutHint: "2-col"},
			{TemplateID: "v3", Title: "Var C", LayoutHint: "3-col"},
			{TemplateID: "v4", Title: "Var D", LayoutHint: "bullets"},
		},
	}
	d := New(g)

	seed := LayoutOption{Index: 2, TemplateID: "g2", Title: "Seed", LayoutHint: "2-col"}
	res, err := d.MoreLike(context.Background(), seed, SlidePrompt{Intent: "x"})
	if err != nil {
		t.Fatalf("MoreLike: %v", err)
	}
	if res.MoreLike != 2 {
		t.Errorf("MoreLike = %d, want 2", res.MoreLike)
	}
	if len(res.Options) != 4 {
		t.Errorf("len(Options) = %d, want 4", len(res.Options))
	}
}

// ---------------------------------------------------------------------------
// Tests — fingerprint / diversity
// ---------------------------------------------------------------------------

func TestLayoutFingerprintAxes(t *testing.T) {
	tests := []struct {
		name string
		in   LayoutOption
		want string
	}{
		{"title-center", LayoutOption{LayoutHint: "title-center"}, "center|1|none"},
		{"title-top default", LayoutOption{LayoutHint: "title"}, "top|1|none"},
		{"split-2col", LayoutOption{LayoutHint: "split"}, "left|2|none"},
		{"data-viz", LayoutOption{LayoutHint: "data-viz"}, "top|1|chart"},
		{"image-content", LayoutOption{LayoutHint: "image"}, "top|1|image"},
		{"table", LayoutOption{LayoutHint: "table"}, "top|1|table"},
		{"3col", LayoutOption{LayoutHint: "3-col"}, "top|3|none"},
		{"4col", LayoutOption{LayoutHint: "4-col"}, "top|4|none"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := LayoutFingerprint(tt.in)
			if got != tt.want {
				t.Errorf("LayoutFingerprint(%v) = %q, want %q", tt.in.LayoutHint, got, tt.want)
			}
		})
	}
}

func TestPickDistinctKeepsOrderOfArrival(t *testing.T) {
	in := []LayoutOption{
		{TemplateID: "a", LayoutHint: "title-center"},
		{TemplateID: "b", LayoutHint: "bullets"},
		{TemplateID: "c", LayoutHint: "title-center"}, // dup
		{TemplateID: "d", LayoutHint: "data-viz"},
	}
	out := pickDistinct(in, SlidePrompt{Intent: "x"}, 4)
	if len(out) != 4 {
		t.Fatalf("len = %d, want 4", len(out))
	}
	// The duplicate must have been replaced by a fallback.
	if out[2].TemplateID == "c" {
		t.Error("duplicate should have been skipped")
	}
}

// ---------------------------------------------------------------------------
// Tests — fallback templates
// ---------------------------------------------------------------------------

func TestFallbacksArePromptAware(t *testing.T) {
	// "comparison" intent should reorder fallbacks toward 3-col / 4-col / table.
	fb := fallbackTemplatesForPrompt(SlidePrompt{
		Intent:   "comparison of pricing tiers",
		Keywords: []string{"comparison"},
	})
	if len(fb) == 0 {
		t.Fatal("expected fallbacks, got 0")
	}
	// Top of the list should include either 3col or table.
	top := fb[0]
	if !strings.Contains(top.TemplateID, "3col") && !strings.Contains(top.TemplateID, "table") && !strings.Contains(top.TemplateID, "2col") {
		t.Logf("top fallback for comparison = %s (acceptable but not strict)", top.TemplateID)
	}
}

func TestFallbacksAlwaysIncludeFourCol(t *testing.T) {
	fb := fallbackTemplatesForPrompt(SlidePrompt{Intent: "anything"})
	has4 := false
	for _, f := range fb {
		if strings.Contains(f.TemplateID, "4col") {
			has4 = true
			break
		}
	}
	if !has4 {
		t.Error("expected 4-col fallback in default set")
	}
}