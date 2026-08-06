package redesign

import (
	"context"
	"errors"
	"strings"
	"testing"
)

// ---------------------------------------------------------------------------
// Tests — content preservation
// ---------------------------------------------------------------------------

func TestContentEqualDiffIdentical(t *testing.T) {
	s := SlideInput{
		ID: "s1", Title: "Hello",
		Elements: []SlideElement{
			{ID: "e1", Kind: "text", Text: "Hello world"},
			{ID: "e2", Kind: "chart", ChartType: "bar", DataBinding: "sheet-1!A1:D10"},
		},
		CitationRefs: []string{"c1", "c2"},
	}
	if err := ContentEqualDiff(s, s); err != nil {
		t.Errorf("expected nil, got %v", err)
	}
}

func TestContentEqualDiffTitleChanged(t *testing.T) {
	b := SlideInput{ID: "s1", Title: "Hello"}
	a := SlideInput{ID: "s1", Title: "Hello (v2)"}
	if err := ContentEqualDiff(b, a); err == nil {
		t.Fatal("expected error for title change")
	} else if !strings.Contains(err.Error(), "title") {
		t.Errorf("err should mention title: %v", err)
	}
}

func TestContentEqualDiffTextChanged(t *testing.T) {
	b := SlideInput{ID: "s1", Elements: []SlideElement{{ID: "e1", Kind: "text", Text: "A"}}}
	a := SlideInput{ID: "s1", Elements: []SlideElement{{ID: "e1", Kind: "text", Text: "B"}}}
	if err := ContentEqualDiff(b, a); err == nil {
		t.Fatal("expected error for text change")
	}
}

func TestContentEqualDiffElementMissing(t *testing.T) {
	b := SlideInput{ID: "s1", Elements: []SlideElement{{ID: "e1"}, {ID: "e2"}}}
	a := SlideInput{ID: "s1", Elements: []SlideElement{{ID: "e1"}}}
	if err := ContentEqualDiff(b, a); err == nil {
		t.Fatal("expected error for missing element")
	}
}

func TestContentEqualDiffDataBindingChanged(t *testing.T) {
	b := SlideInput{ID: "s1", Elements: []SlideElement{{ID: "e1", DataBinding: "sheet-1!A1:D10"}}}
	a := SlideInput{ID: "s1", Elements: []SlideElement{{ID: "e1", DataBinding: "sheet-2!A1:D10"}}}
	if err := ContentEqualDiff(b, a); err == nil {
		t.Fatal("expected error for data binding change")
	}
}

func TestContentEqualDiffCitationsDifferent(t *testing.T) {
	b := SlideInput{ID: "s1", CitationRefs: []string{"c1"}}
	a := SlideInput{ID: "s1", CitationRefs: []string{"c2"}}
	if err := ContentEqualDiff(b, a); err == nil {
		t.Fatal("expected error for citation change")
	}
}

func TestContentEqualDiffCitationsSameSet(t *testing.T) {
	b := SlideInput{ID: "s1", CitationRefs: []string{"c1", "c2"}}
	a := SlideInput{ID: "s1", CitationRefs: []string{"c2", "c1"}}
	if err := ContentEqualDiff(b, a); err != nil {
		t.Errorf("expected nil for set-equal citations, got %v", err)
	}
}

func TestContentEqualDiffIgnoresCoordinates(t *testing.T) {
	b := SlideInput{
		ID: "s1", Title: "T",
		Elements: []SlideElement{{ID: "e1", Kind: "text", Text: "x", X: 0.1, Y: 0.2, W: 0.3, H: 0.4}},
	}
	a := SlideInput{
		ID: "s1", Title: "T",
		Elements: []SlideElement{{ID: "e1", Kind: "text", Text: "x", X: 0.5, Y: 0.6, W: 0.7, H: 0.8}},
	}
	if err := ContentEqualDiff(b, a); err != nil {
		t.Errorf("expected nil, got %v", err)
	}
}

// ---------------------------------------------------------------------------
// Tests — Redesigner with SpacingMutator
// ---------------------------------------------------------------------------

func TestRedesignLightSpacing(t *testing.T) {
	r := New(&SpacingMutator{SpacingFactor: 1.1})
	slide := SlideInput{
		ID: "s1", Title: "T",
		Elements: []SlideElement{
			{ID: "e1", Kind: "text", Text: "x", W: 100, H: 50},
		},
	}
	opt, err := r.Redesign(context.Background(), slide, ModeLight)
	if err != nil {
		t.Fatalf("Redesign: %v", err)
	}
	if !opt.PreservationContentEqual {
		t.Error("content should be preserved")
	}
	if len(opt.Changes) == 0 {
		t.Fatal("expected layout changes")
	}
	if !floatNear(opt.Slide.Elements[0].W, 110, 1e-6) {
		t.Errorf("W = %f, want ~110", opt.Slide.Elements[0].W)
	}
}

func TestRedesignFullRespectsLockedRegion(t *testing.T) {
	// A malicious mutator that ignores Locked and tries to modify the
	// element. The Redesigner must catch this and refuse the option.
	r := New(maliciousMutator{})
	slide := SlideInput{
		ID: "s1", Title: "T",
		Elements: []SlideElement{
			{ID: "e1", Kind: "text", Text: "locked", X: 0.1, Y: 0.1, W: 0.2, H: 0.2, Locked: true},
		},
	}

	_, err := r.Redesign(context.Background(), slide, ModeFull)
	if err == nil {
		t.Fatal("expected error for locked element modification")
	}
	if !strings.Contains(err.Error(), "locked") {
		t.Errorf("err should mention locked: %v", err)
	}
}

type maliciousMutator struct{}

func (maliciousMutator) Redesign(_ context.Context, slide SlideInput, _ Mode) (redesignResult, error) {
	// Mutates locked elements — must be rejected.
	out := make([]SlideElement, 0, len(slide.Elements))
	for _, e := range slide.Elements {
		e.X += 0.5
		e.Y += 0.5
		e.W = 0.99 - e.W
		e.H = 0.99 - e.H
		out = append(out, e)
	}
	return redesignResult{elements: out}, nil
}

func floatNear(a, b, eps float64) bool {
	d := a - b
	if d < 0 {
		d = -d
	}
	return d < eps
}

func TestRedesignInvalidMode(t *testing.T) {
	r := New(&SpacingMutator{})
	_, err := r.Redesign(context.Background(), SlideInput{}, Mode("nuclear"))
	if err == nil {
		t.Fatal("expected error for invalid mode")
	}
}

func TestRedesignNoMutator(t *testing.T) {
	r := New(nil)
	_, err := r.Redesign(context.Background(), SlideInput{}, ModeLight)
	if err != ErrNoMutator {
		t.Errorf("expected ErrNoMutator, got %v", err)
	}
}

// ---------------------------------------------------------------------------
// Tests — Deterministic mutator behavior
// ---------------------------------------------------------------------------

func TestSpacingMutatorFullNormalizesToGrid(t *testing.T) {
	s := SpacingMutator{NormalizeColumns: true}
	in := SlideInput{
		ID: "s1",
		Elements: []SlideElement{
			{ID: "e1", Kind: "text", Text: "x", X: 0.49, Y: 0.49, W: 0.49, H: 0.49},
		},
	}
	res, err := s.Redesign(context.Background(), in, ModeFull)
	if err != nil {
		t.Fatalf("Redesign: %v", err)
	}
	if len(res.elements) != 1 {
		t.Fatalf("expected 1 element, got %d", len(res.elements))
	}
	got := res.elements[0]
	// step = 1/6 ≈ 0.1666, so 0.49 should snap to 0.5 (rounded).
	if got.X < 0.49 || got.X > 0.51 {
		t.Errorf("X = %f, want ~0.5", got.X)
	}
}

func TestSpacingMutatorFullLockedPreserved(t *testing.T) {
	s := SpacingMutator{NormalizeColumns: true}
	in := SlideInput{
		ID: "s1",
		Elements: []SlideElement{
			{ID: "e1", Kind: "text", Text: "x", X: 0.1, Y: 0.1, W: 0.2, H: 0.2, Locked: true},
			{ID: "e2", Kind: "text", Text: "y", X: 0.4, Y: 0.4, W: 0.2, H: 0.2},
		},
	}
	res, err := s.Redesign(context.Background(), in, ModeFull)
	if err != nil {
		t.Fatalf("Redesign: %v", err)
	}
	// Locked element should be unchanged.
	if res.elements[0].X != 0.1 {
		t.Errorf("locked X = %f, want 0.1", res.elements[0].X)
	}
	// Unlocked should snap.
	if res.elements[1].X == 0.4 {
		t.Error("unlocked should have moved")
	}
}

// ---------------------------------------------------------------------------
// Tests — Mutator error propagation
// ---------------------------------------------------------------------------

type errorMutator struct{}

func (errorMutator) Redesign(_ context.Context, _ SlideInput, _ Mode) (redesignResult, error) {
	return redesignResult{}, errors.New("model timeout")
}

func TestRedesignPropagatesMutatorError(t *testing.T) {
	r := New(errorMutator{})
	_, err := r.Redesign(context.Background(), SlideInput{ID: "s1", Title: "T",
		Elements: []SlideElement{{ID: "e1", Kind: "text", Text: "x"}}}, ModeLight)
	if err == nil {
		t.Fatal("expected error from mutator")
	}
	if !strings.Contains(err.Error(), "model timeout") {
		t.Errorf("err should wrap model timeout: %v", err)
	}
}
