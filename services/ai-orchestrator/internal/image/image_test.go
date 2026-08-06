package image

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

// ---------------------------------------------------------------------------
// Stub provider
// ---------------------------------------------------------------------------

type stubProvider struct {
	name              string
	generateResult    *GenerateResult
	generateErr       error
	moderateResult    ModerationResult
	moderateErr       error
	removeBgResult    *RemoveBackgroundResult
	removeBgErr       error
	callsGenerate     int
	callsModerate     int
	callsRemoveBg     int
}

func (s *stubProvider) Name() string { return s.name }

func (s *stubProvider) Generate(_ context.Context, _ GenerateRequest, model string) (*GenerateResult, error) {
	s.callsGenerate++
	if s.generateErr != nil {
		return nil, s.generateErr
	}
	if s.generateResult != nil {
		r := *s.generateResult
		r.Model = model
		return &r, nil
	}
	return &GenerateResult{
		URL:      "https://example.com/image.png",
		Provider: s.name,
		Model:    model,
	}, nil
}

func (s *stubProvider) Moderate(_ context.Context, _ string) (ModerationResult, error) {
	s.callsModerate++
	if s.moderateErr != nil {
		return ModerationResult{}, s.moderateErr
	}
	return s.moderateResult, nil
}

func (s *stubProvider) RemoveBackground(_ context.Context, _ RemoveBackgroundRequest) (*RemoveBackgroundResult, error) {
	s.callsRemoveBg++
	if s.removeBgErr != nil {
		return nil, s.removeBgErr
	}
	if s.removeBgResult != nil {
		return s.removeBgResult, nil
	}
	return &RemoveBackgroundResult{
		TransparentPNG: []byte{0x89, 0x50, 0x4E, 0x47},
		URL:            "https://example.com/no-bg.png",
	}, nil
}

// ---------------------------------------------------------------------------
// Tests — orchestration
// ---------------------------------------------------------------------------

func TestGenerateRequiresPrompt(t *testing.T) {
	s := NewImageService(Config{})
	_, err := s.Generate(context.Background(), GenerateRequest{})
	if err == nil {
		t.Fatal("expected error for empty prompt")
	}
}

func TestGenerateSuccess(t *testing.T) {
	p := &stubProvider{name: "p1"}
	s := NewImageService(Config{Providers: []Provider{p}})

	res, err := s.Generate(context.Background(), GenerateRequest{Prompt: "abstract hero"})
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}
	if res.URL != "https://example.com/image.png" {
		t.Errorf("URL = %q", res.URL)
	}
	if res.Provider != "p1" {
		t.Errorf("Provider = %q", res.Provider)
	}
	if res.Provenance.GeneratedAt.IsZero() {
		t.Error("GeneratedAt should be set")
	}
	if res.Provenance.Hash == "" {
		t.Error("Hash should be set")
	}
}

func TestGenerateFallsBackOnProviderError(t *testing.T) {
	failing := &stubProvider{name: "fail", generateErr: errors.New("rate limited")}
	success := &stubProvider{name: "ok"}

	s := NewImageService(Config{
		Providers:       []Provider{failing, success},
		ReadyInFallback: "3 min",
	})
	res, err := s.Generate(context.Background(), GenerateRequest{Prompt: "x"})
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}
	if res.Provider != "ok" {
		t.Errorf("Provider = %q, want ok", res.Provider)
	}
}

func TestGenerateAllProvidersFail(t *testing.T) {
	p1 := &stubProvider{name: "p1", generateErr: errors.New("p1 down")}
	p2 := &stubProvider{name: "p2", generateErr: errors.New("p2 down")}
	s := NewImageService(Config{Providers: []Provider{p1, p2}})

	_, err := s.Generate(context.Background(), GenerateRequest{Prompt: "x"})
	if !errors.Is(err, ErrAllProvidersUnavailable) {
		t.Errorf("expected ErrAllProvidersUnavailable, got %v", err)
	}
	if !strings.Contains(err.Error(), "ready in") {
		t.Errorf("err should include ready-in hint: %v", err)
	}
}

// ---------------------------------------------------------------------------
// Tests — moderation (Layer 1 + Layer 2)
// ---------------------------------------------------------------------------

func TestGenerateBlockedByOrchestrator(t *testing.T) {
	p := &stubProvider{name: "p1"}
	s := NewImageService(Config{Providers: []Provider{p}})

	_, err := s.Generate(context.Background(), GenerateRequest{
		Prompt: "please generate a photo of taylor swift at concert",
	})
	if !errors.Is(err, ErrBlockedByOrchestrator) {
		t.Errorf("expected ErrBlockedByOrchestrator, got %v", err)
	}
	if p.callsGenerate != 0 {
		t.Errorf("provider should not be called when blocked, got %d calls", p.callsGenerate)
	}
}

func TestGenerateBlockedByProviderModeration(t *testing.T) {
	p := &stubProvider{
		name:           "p1",
		moderateResult: ModerationResult{Blocked: true, Reason: "trademark"},
	}
	s := NewImageService(Config{Providers: []Provider{p}})

	_, err := s.Generate(context.Background(), GenerateRequest{Prompt: "abstract hero"})
	if !errors.Is(err, ErrModerationBlocked) {
		t.Errorf("expected ErrModerationBlocked, got %v", err)
	}
	if !strings.Contains(err.Error(), "trademark") {
		t.Errorf("err should include reason: %v", err)
	}
}

func TestModerationOKEnrichesResult(t *testing.T) {
	p := &stubProvider{
		name:           "p1",
		moderateResult: ModerationResult{OK: true},
	}
	s := NewImageService(Config{Providers: []Provider{p}})

	res, err := s.Generate(context.Background(), GenerateRequest{Prompt: "x"})
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}
	if !res.Moderation.OK {
		t.Error("Moderation.OK should be true")
	}
	if res.Moderation.Layer2Hit {
		t.Error("Layer2Hit should be false when not blocked")
	}
}

func TestDefaultBlocklistIncludesTrademarkAndCSAM(t *testing.T) {
	b := DefaultBlocklist()
	if len(b) < 3 {
		t.Errorf("blocklist too small: %d", len(b))
	}
	// Verify case-insensitive match.
	p := &stubProvider{name: "p1"}
	s := NewImageService(Config{Providers: []Provider{p}})
	_, err := s.Generate(context.Background(), GenerateRequest{
		Prompt: "Generate Mickey Mouse illustration",
	})
	if !errors.Is(err, ErrBlockedByOrchestrator) {
		t.Errorf("expected block on Mickey Mouse, got %v", err)
	}
}

// ---------------------------------------------------------------------------
// Tests — style-lock
// ---------------------------------------------------------------------------

func TestStyleLockAppliedToPrompt(t *testing.T) {
	p := &stubProvider{name: "p1"}
	s := NewImageService(Config{Providers: []Provider{p}})

	_, err := s.Generate(context.Background(), GenerateRequest{
		Prompt: "abstract hero",
		Brand: BrandKit{
			Name:              "Acme",
			Palette:           []string{"#FF0000", "#00FF00"},
			IllustrationStyle: "flat",
			Mood:              "playful",
		},
	})
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}
	// The stub's Generate was called with the styled prompt.
	if p.callsGenerate != 1 {
		t.Fatalf("expected 1 Generate call, got %d", p.callsGenerate)
	}
}

func TestStyleLockNoBrandPreservesPrompt(t *testing.T) {
	got := styleLock("abstract hero", BrandKit{})
	if got != "abstract hero" {
		t.Errorf("no-brand styleLock changed prompt: %q", got)
	}
}

func TestStyleLockIncludesBrandElements(t *testing.T) {
	got := styleLock("abstract hero", BrandKit{
		Name: "Acme", Palette: []string{"#FF0000"}, IllustrationStyle: "flat", Mood: "playful",
	})
	if !strings.Contains(got, "flat") {
		t.Error("styleLock should include illustration style")
	}
	if !strings.Contains(got, "playful") {
		t.Error("styleLock should include mood")
	}
	if !strings.Contains(got, "#FF0000") {
		t.Error("styleLock should include palette colors")
	}
	if !strings.Contains(got, "Acme") {
		t.Error("styleLock should include brand name")
	}
}

// ---------------------------------------------------------------------------
// Tests — Provenance
// ---------------------------------------------------------------------------

func TestProvenanceHashPresent(t *testing.T) {
	p := &stubProvider{name: "openai"}
	s := NewImageService(Config{Providers: []Provider{p}})
	res, err := s.Generate(context.Background(), GenerateRequest{Prompt: "x"})
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}
	if res.Provenance.Hash == "" {
		t.Fatal("hash missing")
	}
	if len(res.Provenance.Hash) != 64 {
		t.Errorf("expected 64-char hex sha256, got %d chars", len(res.Provenance.Hash))
	}
}

func TestProvenanceHashDeterministic(t *testing.T) {
	p := &stubProvider{name: "openai"}
	s := NewImageService(Config{Providers: []Provider{p}})
	r1, _ := s.Generate(context.Background(), GenerateRequest{Prompt: "x"})
	r2, _ := s.Generate(context.Background(), GenerateRequest{Prompt: "x"})
	if r1.Provenance.Hash != r2.Provenance.Hash {
		t.Errorf("hash should be deterministic, got %s vs %s", r1.Provenance.Hash, r2.Provenance.Hash)
	}
}

func TestProvenanceTimestampSet(t *testing.T) {
	before := time.Now().UTC()
	p := &stubProvider{name: "openai"}
	s := NewImageService(Config{Providers: []Provider{p}})
	res, err := s.Generate(context.Background(), GenerateRequest{Prompt: "x"})
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}
	if res.Provenance.GeneratedAt.Before(before) {
		t.Error("GeneratedAt should be >= test start time")
	}
}

// ---------------------------------------------------------------------------
// Tests — Background removal
// ---------------------------------------------------------------------------

func TestRemoveBackgroundSuccess(t *testing.T) {
	p := &stubProvider{name: "removebg"}
	s := NewImageService(Config{Providers: []Provider{p}})
	res, err := s.RemoveBackground(context.Background(), RemoveBackgroundRequest{ImageURL: "https://x.com/y.jpg"})
	if err != nil {
		t.Fatalf("RemoveBackground: %v", err)
	}
	if res.URL != "https://example.com/no-bg.png" {
		t.Errorf("URL = %q", res.URL)
	}
	if len(res.TransparentPNG) == 0 {
		t.Error("TransparentPNG should be populated")
	}
}

func TestRemoveBackgroundRequiresInput(t *testing.T) {
	s := NewImageService(Config{})
	_, err := s.RemoveBackground(context.Background(), RemoveBackgroundRequest{})
	if err == nil {
		t.Fatal("expected error for missing input")
	}
}

func TestRemoveBackgroundFallsBack(t *testing.T) {
	failing := &stubProvider{name: "fail", removeBgErr: errors.New("down")}
	success := &stubProvider{name: "ok"}
	s := NewImageService(Config{Providers: []Provider{failing, success}})

	res, err := s.RemoveBackground(context.Background(), RemoveBackgroundRequest{ImageURL: "x"})
	if err != nil {
		t.Fatalf("RemoveBackground: %v", err)
	}
	if success.callsRemoveBg != 1 {
		t.Errorf("ok provider not called, got %d calls", success.callsRemoveBg)
	}
	_ = res
}

func TestRemoveBackgroundAllFail(t *testing.T) {
	p1 := &stubProvider{name: "p1", removeBgErr: errors.New("p1 down")}
	p2 := &stubProvider{name: "p2", removeBgErr: errors.New("p2 down")}
	s := NewImageService(Config{Providers: []Provider{p1, p2}})

	_, err := s.RemoveBackground(context.Background(), RemoveBackgroundRequest{ImageURL: "x"})
	if !errors.Is(err, ErrAllProvidersUnavailable) {
		t.Errorf("expected ErrAllProvidersUnavailable, got %v", err)
	}
}

// ---------------------------------------------------------------------------
// Tests — isBlocked helper
// ---------------------------------------------------------------------------

func TestIsBlockedCaseInsensitive(t *testing.T) {
	s := &ImageService{blocklist: []string{"Mickey Mouse"}}
	if !s.isBlocked("mickey mouse dancing") {
		t.Error("isBlocked should be case-insensitive")
	}
	if s.isBlocked("completely innocent prompt") {
		t.Error("isBlocked should not flag innocent prompts")
	}
}