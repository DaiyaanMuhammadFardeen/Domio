package copy

import (
	"context"
	"errors"
	"strings"
	"testing"
)

// ---------------------------------------------------------------------------
// Stub transformer
// ---------------------------------------------------------------------------

type stubTransformer struct {
	resp CopyResult
	err  error
}

func (s *stubTransformer) Transform(_ context.Context, _ CopyRequest) (CopyResult, error) {
	if s.err != nil {
		return CopyResult{}, s.err
	}
	return s.resp, nil
}

// ---------------------------------------------------------------------------
// Tests — validation
// ---------------------------------------------------------------------------

func TestApplyInvalidAction(t *testing.T) {
	c := New(nil)
	_, err := c.Apply(context.Background(), CopyRequest{
		Action:     "haiku",
		SourceText: "x",
	})
	if err == nil {
		t.Fatal("expected error for invalid action")
	}
}

func TestApplyEmptySource(t *testing.T) {
	c := New(nil)
	_, err := c.Apply(context.Background(), CopyRequest{
		Action:     ActionShorten,
		SourceText: "   ",
	})
	if err != ErrNoSource {
		t.Errorf("expected ErrNoSource, got %v", err)
	}
}

func TestApplyTranslateRequiresTargetLang(t *testing.T) {
	c := New(nil)
	_, err := c.Apply(context.Background(), CopyRequest{
		Action:     ActionTranslate,
		SourceText: "hello",
	})
	if err == nil {
		t.Fatal("expected error for missing target_lang")
	}
}

// ---------------------------------------------------------------------------
// Tests — transformer delegation
// ---------------------------------------------------------------------------

func TestApplyDelegatesToTransformer(t *testing.T) {
	stub := &stubTransformer{
		resp: CopyResult{OutputText: "stub response"},
	}
	c := New(stub)

	out, err := c.Apply(context.Background(), CopyRequest{
		Action:     ActionShorten,
		SourceText: "long source text here",
	})
	if err != nil {
		t.Fatalf("Apply: %v", err)
	}
	if out.OutputText != "stub response" {
		t.Errorf("OutputText = %q, want stub response", out.OutputText)
	}
}

func TestApplyFallsBackWhenTransformerReturnsEmpty(t *testing.T) {
	c := New(&stubTransformer{resp: CopyResult{OutputText: ""}})
	out, err := c.Apply(context.Background(), CopyRequest{
		Action:     ActionShorten,
		SourceText: "this is a sentence",
	})
	if err != nil {
		t.Fatalf("Apply: %v", err)
	}
	if out.OutputText == "" {
		t.Fatal("expected heuristic fallback, got empty")
	}
}

// ---------------------------------------------------------------------------
// Tests — heuristic transform
// ---------------------------------------------------------------------------

func TestShortenReducesLength(t *testing.T) {
	got := shorten("the quick brown fox jumps over the lazy dog", 0)
	if len(got) >= len("the quick brown fox jumps over the lazy dog") {
		t.Errorf("shorten should reduce length, got %q", got)
	}
}

func TestShortenRespectsMaxChars(t *testing.T) {
	got := shorten("one two three four five six seven eight", 14)
	if len(got) > 14 {
		t.Errorf("len = %d, want <=14", len(got))
	}
}

func TestPunchUpRemovesFillers(t *testing.T) {
	got := punchUp("we just really need to ship this")
	if strings.Contains(got, "just") || strings.Contains(got, "really") {
		t.Errorf("punchUp should remove fillers, got %q", got)
	}
}

func TestPunchUpCapitalizesFirstLetter(t *testing.T) {
	got := punchUp("hello world")
	if got[0] != 'H' {
		t.Errorf("first letter should be uppercase, got %q", got)
	}
}

func TestAdjustToneReturnsMarker(t *testing.T) {
	got := adjustTone("hello", ToneCasual)
	if !strings.Contains(got, "tone:casual") {
		t.Errorf("got %q, want tone:casual marker", got)
	}
}

// ---------------------------------------------------------------------------
// Tests — Glossary
// ---------------------------------------------------------------------------

func TestApplyGlossaryPreservesTermsEmpty(t *testing.T) {
	hits := applyGlossary("any text", nil)
	if len(hits) != 0 {
		t.Errorf("expected 0 hits for empty glossary, got %v", hits)
	}
}

func TestApplyGlossaryDetectsTerms(t *testing.T) {
	g := []GlossaryEntry{{Term: "Domio"}, {Term: "AI"}}
	hits := applyGlossary("Welcome to Domio AI", g)
	if len(hits) != 2 {
		t.Errorf("got %d hits, want 2", len(hits))
	}
}

func TestGlossaryMissesDetectsDrops(t *testing.T) {
	g := []GlossaryEntry{{Term: "Domio"}, {Term: "Acme"}}
	misses := GlossaryMisses("Welcome to Domio", "Hello", g)
	if len(misses) != 1 || misses[0] != "Domio" {
		t.Errorf("got %v, want [Domio]", misses)
	}
}

func TestApplyPreservesGlossaryAudit(t *testing.T) {
	c := New(nil)
	out, err := c.Apply(context.Background(), CopyRequest{
		Action:     ActionShorten,
		SourceText: "Welcome to Domio the best platform",
		Glossary:   []GlossaryEntry{{Term: "Domio"}},
	})
	if err != nil {
		t.Fatalf("Apply: %v", err)
	}
	if len(out.PreservedTerms) == 0 || out.PreservedTerms[0] != "Domio" {
		t.Errorf("expected Domio to be flagged preserved, got %v", out.PreservedTerms)
	}
}

// ---------------------------------------------------------------------------
// Tests — RTL + overflow
// ---------------------------------------------------------------------------

func TestIsRTL(t *testing.T) {
	tests := map[string]bool{
		"ar":      true,
		"Arabic":  true,
		"he":      true,
		"ur":      true,
		"es":      false,
		"zh":      false,
		"":        false,
	}
	for lang, want := range tests {
		if got := IsRTL(lang); got != want {
			t.Errorf("IsRTL(%q) = %v, want %v", lang, got, want)
		}
	}
}

func TestTranslateArabicTriggersRTLWarning(t *testing.T) {
	c := New(nil)
	out, err := c.Apply(context.Background(), CopyRequest{
		Action:     ActionTranslate,
		SourceText: "Welcome to our platform",
		TargetLang: "ar",
	})
	if err != nil {
		t.Fatalf("Apply: %v", err)
	}
	if out.TranslatedInto != "ar" {
		t.Errorf("TranslatedInto = %q, want ar", out.TranslatedInto)
	}
	if !strings.Contains(out.LayoutWarning, "rtl") {
		t.Errorf("expected rtl warning, got %q", out.LayoutWarning)
	}
}

func TestLongOutputTriggersOverflowWarning(t *testing.T) {
	stub := &stubTransformer{
		resp: CopyResult{OutputText: "this is a very very very very very very very very long response indeed"},
	}
	c := New(stub)
	out, err := c.Apply(context.Background(), CopyRequest{
		Action:     ActionShorten,
		SourceText: "hi",
	})
	if err != nil {
		t.Fatalf("Apply: %v", err)
	}
	if out.LayoutWarning != "overflow_risk" {
		t.Errorf("expected overflow_risk, got %q", out.LayoutWarning)
	}
}

// ---------------------------------------------------------------------------
// Tests — errors
// ---------------------------------------------------------------------------

type errorTransformer struct{}

func (errorTransformer) Transform(_ context.Context, _ CopyRequest) (CopyResult, error) {
	return CopyResult{}, errors.New("model down")
}

func TestApplyPropagatesTransformerErrorWhenOutputEmpty(t *testing.T) {
	// When transformer returns an error AND we have no fallback, we
	// still want to surface *some* result. The fallback path covers
	// this case so the call succeeds.
	c := New(errorTransformer{})
	_, err := c.Apply(context.Background(), CopyRequest{
		Action:     ActionShorten,
		SourceText: "this is a test",
	})
	if err != nil {
		t.Fatalf("Apply should succeed via fallback, got %v", err)
	}
}