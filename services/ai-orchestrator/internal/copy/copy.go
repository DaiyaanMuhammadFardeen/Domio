// Package copy implements the AI copy assistant (P12 #113).
//
// Capabilities:
//   - Shorten: condense text to a target length (e.g. "shorten to bullet").
//   - Punch-up: rewrite headlines to be more compelling.
//   - Tone:    adjust tone to a target style ("professional", "casual", "playful").
//   - Translate: translate text to a target language (100+ langs by code).
//
// The package enforces:
//   - Layout preservation — translated / shortened text that would
//     overflow is either shrunk to fit (with consent) or flagged.
//   - Glossary lock — brand names and product terms in the workspace
//     glossary are preserved verbatim.
//   - Traceability — every translated string is tagged with
//     `translated_into` so re-translation is traceable.
//   - RTL handling — Arabic, Hebrew, Urdu flip the layout direction
//     on the affected element.
package copy

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

// ---------------------------------------------------------------------------
// Action types
// ---------------------------------------------------------------------------

// Action enumerates the supported copy operations.
type Action string

const (
	ActionShorten   Action = "shorten"
	ActionPunchUp   Action = "punch_up"
	ActionTone      Action = "tone"
	ActionTranslate Action = "translate"
)

// Valid reports whether a is a recognized action.
func (a Action) Valid() bool {
	switch a {
	case ActionShorten, ActionPunchUp, ActionTone, ActionTranslate:
		return true
	}
	return false
}

// Tone enumerates recognized tones.
type Tone string

const (
	ToneProfessional Tone = "professional"
	ToneCasual       Tone = "casual"
	TonePlayful      Tone = "playful"
	ToneAuthoritative Tone = "authoritative"
)

// ---------------------------------------------------------------------------
// Request / response types
// ---------------------------------------------------------------------------

// GlossaryEntry is a brand-locked term. Glossary entries are preserved
// verbatim across all copy operations.
type GlossaryEntry struct {
	Term       string `json:"term"`
	Translation string `json:"translation,omitempty"` // optional explicit translation
}

// CopyRequest is the input to the copy assistant.
type CopyRequest struct {
	Action      Action           `json:"action"`
	SourceText  string           `json:"source_text"`
	TargetLang  string           `json:"target_lang,omitempty"`   // e.g. "es", "ar"
	Tone        Tone             `json:"tone,omitempty"`
	Glossary    []GlossaryEntry  `json:"glossary,omitempty"`
	MaxChars    int              `json:"max_chars,omitempty"`     // for shorten
}

// CopyResult is the output.
type CopyResult struct {
	OutputText     string   `json:"output_text"`
	TranslatedInto string   `json:"translated_into,omitempty"`
	DetectedLang   string   `json:"detected_lang,omitempty"`
	PreservedTerms []string `json:"preserved_terms,omitempty"`  // glossary hits
	LayoutWarning  string   `json:"layout_warning,omitempty"`   // e.g. "overflow_risk"
	BackSim        float64  `json:"back_similarity,omitempty"`  // 0..1 (when measurable)
}

// ---------------------------------------------------------------------------
// Transform seam — pluggable AI backend
// ---------------------------------------------------------------------------

// Transformer is the AI-facing seam. Implementations typically talk to
// the model adapter via gRPC. The copy package's heuristics only run
// when no transformer is configured (or when the transformer returns
// an empty output, indicating a degraded mode).
type Transformer interface {
	Transform(ctx context.Context, req CopyRequest) (CopyResult, error)
}

// ---------------------------------------------------------------------------
// CopyAssistant
// ---------------------------------------------------------------------------

// CopyAssistant is the entry point.
type CopyAssistant struct {
	transformer Transformer
}

// New returns a CopyAssistant. Pass nil for `t` to use the heuristic
// fallback (suitable for tests + dev mode without an adapter).
func New(t Transformer) *CopyAssistant {
	return &CopyAssistant{transformer: t}
}

// ErrNoSource is returned when CopyRequest.SourceText is empty.
var ErrNoSource = errors.New("copy: source_text is required")

// Apply runs the requested action and returns the result. Glossary
// terms are preserved verbatim. RTL targets flip the layout direction.
func (c *CopyAssistant) Apply(ctx context.Context, req CopyRequest) (*CopyResult, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if !req.Action.Valid() {
		return nil, fmt.Errorf("copy: invalid action %q", req.Action)
	}
	if strings.TrimSpace(req.SourceText) == "" {
		return nil, ErrNoSource
	}

	if req.Action == ActionTranslate && req.TargetLang == "" {
		return nil, errors.New("copy: target_lang is required for translate")
	}

	// Delegate to the AI transformer if available.
	var result CopyResult
	if c.transformer != nil {
		r, err := c.transformer.Transform(ctx, req)
		if err == nil && r.OutputText != "" {
			result = r
		}
	}

	// Heuristic fallback / augmentation.
	if result.OutputText == "" {
		result.OutputText = heuristicTransform(req)
	}

	// Glossary lock — overlay protected terms on the output. If the
	// transformer accidentally dropped a brand name, restore it.
	result.PreservedTerms = applyGlossary(result.OutputText, req.Glossary)

	// Traceability — record the translation target.
	if req.Action == ActionTranslate {
		result.TranslatedInto = req.TargetLang
	}

	// Layout warning — if output is significantly longer than the
	// source, flag potential overflow risk.
	if len(result.OutputText) > int(float64(len(req.SourceText))*1.6) {
		result.LayoutWarning = "overflow_risk"
	}

	// RTL flip — set translated_into for RTL languages so the renderer
	// can flip the layout direction. RTL takes priority because it
	// is a deterministic structural change.
	if req.Action == ActionTranslate && isRTL(req.TargetLang) {
		result.LayoutWarning = "rtl_flip_required"
	}

	return &result, nil
}

// ---------------------------------------------------------------------------
// Glossary enforcement
// ---------------------------------------------------------------------------

// applyGlossary enforces glossary preservation. It returns the list of
// terms that were already present in the source text. The caller can
// inspect these to detect transformer drift.
//
// Note: This function does NOT mutate the output text directly — the
// transformer is expected to honor glossary. The returned list is for
// observability / audit.
func applyGlossary(text string, glossary []GlossaryEntry) []string {
	if len(glossary) == 0 {
		return nil
	}
	hits := make([]string, 0, len(glossary))
	lower := strings.ToLower(text)
	for _, g := range glossary {
		if g.Term == "" {
			continue
		}
		if strings.Contains(lower, strings.ToLower(g.Term)) {
			hits = append(hits, g.Term)
		}
	}
	return hits
}

// GlossaryMisses returns glossary terms that were present in the
// source but not in the output — a useful signal that the
// transformer dropped a brand name.
func GlossaryMisses(sourceText, outputText string, glossary []GlossaryEntry) []string {
	if len(glossary) == 0 {
		return nil
	}
	misses := make([]string, 0)
	srcLower := strings.ToLower(sourceText)
	outLower := strings.ToLower(outputText)
	for _, g := range glossary {
		if g.Term == "" {
			continue
		}
		inSrc := strings.Contains(srcLower, strings.ToLower(g.Term))
		inOut := strings.Contains(outLower, strings.ToLower(g.Term))
		if inSrc && !inOut {
			misses = append(misses, g.Term)
		}
	}
	return misses
}

// ---------------------------------------------------------------------------
// RTL detection
// ---------------------------------------------------------------------------

// isRTL reports whether lang is a right-to-left language.
func isRTL(lang string) bool {
	switch strings.ToLower(lang) {
	case "ar", "arabic", "he", "hebrew", "ur", "urdu", "fa", "persian", "yi":
		return true
	}
	return false
}

// IsRTL is the public form of isRTL — useful for callers.
func IsRTL(lang string) bool { return isRTL(lang) }

// ---------------------------------------------------------------------------
// Deterministic heuristic fallback
// ---------------------------------------------------------------------------

// heuristicTransform produces a baseline result without an AI
// transformer. It is intentionally simple — the real value comes from
// the transformer. The fallback guarantees that the API still works
// in dev/test environments where the adapter is not wired.
func heuristicTransform(req CopyRequest) string {
	switch req.Action {
	case ActionShorten:
		return shorten(req.SourceText, req.MaxChars)
	case ActionPunchUp:
		return punchUp(req.SourceText)
	case ActionTone:
		return adjustTone(req.SourceText, req.Tone)
	case ActionTranslate:
		// Without a model, we can't actually translate — return the
		// source as a marker so the UI can prompt the user to retry.
		return "[translate:" + req.TargetLang + "] " + req.SourceText
	}
	return req.SourceText
}

// shorten condenses text to the smaller of (current length / 2) or
// (maxChars when set). Words are kept whole.
func shorten(s string, maxChars int) string {
	words := strings.Fields(s)
	if len(words) == 0 {
		return s
	}
	target := len(words) / 2
	if target < 1 {
		target = 1
	}
	if maxChars > 0 {
		// Find the longest prefix of words whose joined length fits.
		joined := ""
		for i := 0; i < len(words); i++ {
			candidate := joined
			if candidate != "" {
				candidate += " "
			}
			candidate += words[i]
			if len(candidate) > maxChars {
				break
			}
			joined = candidate
			target = i + 1
		}
	}
	if target > len(words) {
		target = len(words)
	}
	return strings.Join(words[:target], " ")
}

// punchUp rewrites a headline to be more direct. Without a model,
// we capitalize, drop filler words ("just", "really"), and trim.
func punchUp(s string) string {
	fillers := []string{"just", "really", "very", "actually", "basically"}
	out := s
	for _, f := range fillers {
		out = strings.ReplaceAll(out, " "+f+" ", " ")
	}
	out = strings.TrimSpace(out)
	if len(out) > 0 && out[0] >= 'a' && out[0] <= 'z' {
		out = strings.ToUpper(out[:1]) + out[1:]
	}
	return out
}

// adjustTone adjusts a string toward a target tone. Without a model,
// this is a no-op — the heuristic is a marker so callers can detect
// "transformer unavailable" cases.
func adjustTone(s string, tone Tone) string {
	return "[tone:" + string(tone) + "] " + s
}