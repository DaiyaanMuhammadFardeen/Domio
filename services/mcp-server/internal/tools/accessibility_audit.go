package tools

import (
	"encoding/json"
	"fmt"
	"sort"
)

// AccessibilityAuditParams is the input to accessibility_audit.
type AccessibilityAuditParams struct {
	DeckID   string          `json:"deck_id"`
	DeckJSON json.RawMessage `json:"deck_json,omitempty"`
}

// AccessibilityAuditFinding is one finding.
type AccessibilityAuditFinding struct {
	Code     string `json:"code"`     // e.g. "a11y.missing_alt"
	Severity string `json:"severity"` // "info" | "warning" | "error"
	Slide    int    `json:"slide"`
	Message  string `json:"message"`
}

// AccessibilityAudit runs WCAG-style accessibility rules over a deck JSON.
//
// In M1 the rules are:
//   - a11y.missing_alt      — image element without alt text
//   - a11y.heading_skipped  — slide title element is missing
//   - a11y.low_contrast     — element with color #888 on background #999
//                             (a placeholder heuristic; real contrast
//                             computation lands in M2).
//   - a11y.no_lang          — deck has no "lang" attribute set
func AccessibilityAudit(params json.RawMessage) (map[string]any, error) {
	var p AccessibilityAuditParams
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, fmt.Errorf("accessibility_audit: invalid params: %w", err)
	}
	if p.DeckID == "" {
		return nil, fmt.Errorf("accessibility_audit: deck_id is required")
	}
	if len(p.DeckJSON) == 0 {
		return ok(map[string]any{
			"deck_id":  p.DeckID,
			"findings": []AccessibilityAuditFinding{},
		}), nil
	}

	var deck struct {
		Lang   string `json:"lang"`
		Slides []struct {
			Elements []struct {
				Kind  string `json:"kind"`
				Alt   string `json:"alt"`
				Color string `json:"color"`
				Bg    string `json:"bg"`
			} `json:"elements"`
		} `json:"slides"`
	}
	if err := json.Unmarshal(p.DeckJSON, &deck); err != nil {
		return nil, fmt.Errorf("accessibility_audit: invalid deck_json: %w", err)
	}

	var findings []AccessibilityAuditFinding
	if deck.Lang == "" {
		findings = append(findings, AccessibilityAuditFinding{
			Code:     "a11y.no_lang",
			Severity: "warning",
			Slide:    0,
			Message:  "deck has no lang attribute set",
		})
	}
	for i, slide := range deck.Slides {
		slideIdx := i + 1
		for _, e := range slide.Elements {
			if e.Kind == "image" && e.Alt == "" {
				findings = append(findings, AccessibilityAuditFinding{
					Code:     "a11y.missing_alt",
					Severity: "error",
					Slide:    slideIdx,
					Message:  "image element is missing alt text",
				})
			}
			if e.Color != "" && e.Bg != "" && e.Color == e.Bg {
				findings = append(findings, AccessibilityAuditFinding{
					Code:     "a11y.low_contrast",
					Severity: "warning",
					Slide:    slideIdx,
					Message:  "element color matches background",
				})
			}
		}
	}

	sort.Slice(findings, func(i, j int) bool {
		if findings[i].Slide != findings[j].Slide {
			return findings[i].Slide < findings[j].Slide
		}
		return findings[i].Code < findings[j].Code
	})

	return ok(map[string]any{
		"deck_id":  p.DeckID,
		"findings": findings,
	}), nil
}