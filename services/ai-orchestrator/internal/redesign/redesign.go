// Package redesign implements the AI slide redesign feature (P12 #112).
//
// Redesign takes one or more slides and produces redesigned versions
// that:
//   - preserve content verbatim (text, data values, citations),
//   - improve layout, typography, visual hierarchy, and brand alignment,
//   - respect brand-locked regions.
//
// Two modes are supported:
//
//   - "light": spacing, alignment, font-size, and color normalization
//     only — no structural changes.
//   - "full":  structural re-layout (column count, header position, media
//     placement), still content-preserving.
//
// A content-preservation check (ContentEqualDiff) verifies that the
// redesign did not change text, data values, or citation refs. The
// check is mandatory before the redesign can be accepted.
package redesign

import (
	"context"
	"errors"
	"fmt"
)

// ---------------------------------------------------------------------------
// Mode
// ---------------------------------------------------------------------------

// Mode is the redesign aggressiveness.
type Mode string

const (
	// ModeLight makes spacing / alignment / typography changes only.
	ModeLight Mode = "light"
	// ModeFull may change structural layout (column count, header
	// position, media placement). Still content-preserving.
	ModeFull Mode = "full"
)

// Valid reports whether m is a recognized mode.
func (m Mode) Valid() bool {
	return m == ModeLight || m == ModeFull
}

// ---------------------------------------------------------------------------
// Slide input
// ---------------------------------------------------------------------------

// SlideElement is one element on the input slide.
type SlideElement struct {
	ID       string  `json:"id"`
	Kind     string  `json:"kind"`     // "text", "chart", "table", "image", "shape"
	Text     string  `json:"text,omitempty"`
	DataBinding string `json:"data_binding,omitempty"` // e.g. "sheet-1!A1:D10"
	ChartType   string `json:"chart_type,omitempty"`
	Locked      bool   `json:"locked,omitempty"`         // brand-locked region
	X          float64 `json:"x"`
	Y          float64 `json:"y"`
	W          float64 `json:"w"`
	H          float64 `json:"h"`
}

// SlideInput is the source slide being redesigned.
type SlideInput struct {
	ID           string         `json:"id"`
	Title        string         `json:"title"`
	Elements     []SlideElement `json:"elements"`
	CitationRefs []string       `json:"citation_refs,omitempty"`
}

// ---------------------------------------------------------------------------
// Output options
// ---------------------------------------------------------------------------

// LayoutChange describes one structural change applied by the redesign.
type LayoutChange struct {
	ElementID string  `json:"element_id"`
	Axis      string  `json:"axis"` // "x" | "y" | "w" | "h" | "font" | "color"
	Before    float64 `json:"before"`
	After     float64 `json:"after"`
}

// Option is one redesigned slide.
type Option struct {
	Index       int                `json:"index"`
	Mode        Mode               `json:"mode"`
	Slide       SlideInput         `json:"slide"`
	Changes     []LayoutChange     `json:"changes,omitempty"`
	PreservationContentEqual bool  `json:"content_preserved"`
}

// ---------------------------------------------------------------------------
// Content-preservation check
// ---------------------------------------------------------------------------

// ContentEqualDiff returns nil if the redesigned slide preserves all
// content from the source slide. It checks:
//   - title (verbatim),
//   - text content of each element (verbatim),
//   - data_binding strings (verbatim),
//   - citation_refs (set-equal),
//
// It does NOT compare layout coordinates (x/y/w/h) — those are
// expected to change.
//
// Returns a non-nil error if any content was lost or changed. The
// error message lists the specific drifts.
func ContentEqualDiff(before, after SlideInput) error {
	if before.Title != after.Title {
		return fmt.Errorf("redesign: title changed (before=%q, after=%q)",
			before.Title, after.Title)
	}

	// Index by element ID.
	bm := indexElements(before.Elements)
	am := indexElements(after.Elements)

	if len(bm) != len(am) {
		return fmt.Errorf("redesign: element count changed (before=%d, after=%d)",
			len(bm), len(am))
	}

	for id, be := range bm {
		ae, ok := am[id]
		if !ok {
			return fmt.Errorf("redesign: element %s missing in output", id)
		}
		if ae.Text != be.Text {
			return fmt.Errorf("redesign: element %s text changed (before=%q, after=%q)",
				id, be.Text, ae.Text)
		}
		if ae.DataBinding != be.DataBinding {
			return fmt.Errorf("redesign: element %s data binding changed", id)
		}
		if ae.Kind != be.Kind {
			return fmt.Errorf("redesign: element %s kind changed (before=%s, after=%s)",
				id, be.Kind, ae.Kind)
		}
		if ae.ChartType != be.ChartType {
			return fmt.Errorf("redesign: element %s chart type changed", id)
		}
	}

	if !sameSet(before.CitationRefs, after.CitationRefs) {
		return fmt.Errorf("redesign: citation refs changed (before=%v, after=%v)",
			before.CitationRefs, after.CitationRefs)
	}

	return nil
}

// ---------------------------------------------------------------------------
// Redesigner
// ---------------------------------------------------------------------------

// LayoutMutator is the AI-facing seam: given an input slide and mode,
// it returns the redesigned elements + a list of the changes applied.
// Implementations may call the model adapter for full redesign but
// should keep light-mode mutations deterministic / local.
type LayoutMutator interface {
	Redesign(ctx context.Context, slide SlideInput, mode Mode) (redesignResult, error)
}

type redesignResult struct {
	elements []SlideElement
	changes  []LayoutChange
	refused  []string // locked-element IDs that were left untouched
}

// Redesigner produces redesign options for slides.
type Redesigner struct {
	mutator LayoutMutator
}

// New returns a Redesigner backed by the given mutator.
func New(m LayoutMutator) *Redesigner {
	return &Redesigner{mutator: m}
}

// ErrNoMutator indicates the designer was created without a mutator.
var ErrNoMutator = errors.New("redesign: no layout mutator configured")

// Redesign returns 1 redesigned option for the given slide. The
// content-preservation check is enforced before the option is
// returned; if it fails, an error is returned.
func (r *Redesigner) Redesign(ctx context.Context, slide SlideInput, mode Mode) (*Option, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if !mode.Valid() {
		return nil, fmt.Errorf("redesign: invalid mode %q", mode)
	}
	if r.mutator == nil {
		return nil, ErrNoMutator
	}

	res, err := r.mutator.Redesign(ctx, slide, mode)
	if err != nil {
		return nil, fmt.Errorf("redesign: %w", err)
	}

	out := slide
	out.Elements = res.elements

	// Sanity check: a full redesign must never modify locked elements.
	for _, e := range slide.Elements {
		if !e.Locked {
			continue
		}
		var newE SlideElement
		for _, ne := range res.elements {
			if ne.ID == e.ID {
				newE = ne
				break
			}
		}
		if newE != (SlideElement{}) && lockedElementChanged(e, newE) {
			return nil, fmt.Errorf("redesign: locked element %s was modified (refused)", e.ID)
		}
	}

	if err := ContentEqualDiff(slide, out); err != nil {
		return nil, fmt.Errorf("redesign: preservation check failed: %w", err)
	}

	option := &Option{
		Index:                  1,
		Mode:                   mode,
		Slide:                  out,
		Changes:                res.changes,
		PreservationContentEqual: true,
	}

	return option, nil
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func indexElements(elements []SlideElement) map[string]SlideElement {
	m := make(map[string]SlideElement, len(elements))
	for _, e := range elements {
		m[e.ID] = e
	}
	return m
}

func sameSet(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	seen := make(map[string]struct{}, len(a))
	for _, s := range a {
		seen[s] = struct{}{}
	}
	for _, s := range b {
		if _, ok := seen[s]; !ok {
			return false
		}
	}
	return true
}

func lockedElementChanged(before, after SlideElement) bool {
	if before.X != after.X || before.Y != after.Y {
		return true
	}
	if before.W != after.W || before.H != after.H {
		return true
	}
	if before.Text != after.Text {
		return true
	}
	return false
}

// ---------------------------------------------------------------------------
// Deterministic mutator (utility — useful for tests + dev mode)
// ---------------------------------------------------------------------------

// SpacingMutator is a baseline LayoutMutator that applies deterministic
// adjustments without calling the model adapter. It is the fallback
// used when no AI mutator is configured, and is useful for tests.
type SpacingMutator struct {
	// SpacingFactor scales element paddings. Defaults to 1.0 (no-op).
	SpacingFactor float64
	// NormalizeColumns, when true (light mode), aligns all elements
	// to a 12-column grid (full mode) or 6-column grid (light mode).
	NormalizeColumns bool
}

// Redesign applies SpacingMutator to a slide.
func (s *SpacingMutator) Redesign(_ context.Context, slide SlideInput, mode Mode) (redesignResult, error) {
	factor := s.SpacingFactor
	if factor == 0 {
		factor = 1.0
	}

	out := make([]SlideElement, 0, len(slide.Elements))
	changes := make([]LayoutChange, 0)

	for _, e := range slide.Elements {
		if e.Locked {
			// Locked — preserve as-is, record no changes.
			out = append(out, e)
			continue
		}

		newE := e
		switch mode {
		case ModeLight:
			// Light: only spacing — apply factor to width/height.
			if newE.W != 0 {
				newE.W = e.W * factor
				changes = append(changes, LayoutChange{ElementID: e.ID, Axis: "w", Before: e.W, After: newE.W})
			}
			if newE.H != 0 {
				newE.H = e.H * factor
				changes = append(changes, LayoutChange{ElementID: e.ID, Axis: "h", Before: e.H, After: newE.H})
			}
		case ModeFull:
			// Full: normalize to grid columns.
			if s.NormalizeColumns {
				// Snap X and W to nearest 1/12 (or 1/6 for light) increments.
				step := 1.0 / 6.0
				newE.X = snap(e.X, step)
				newE.Y = snap(e.Y, step)
				newE.W = snap(e.W, step)
				newE.H = snap(e.H, step)
				changes = append(changes,
					LayoutChange{ElementID: e.ID, Axis: "x", Before: e.X, After: newE.X},
					LayoutChange{ElementID: e.ID, Axis: "y", Before: e.Y, After: newE.Y},
					LayoutChange{ElementID: e.ID, Axis: "w", Before: e.W, After: newE.W},
					LayoutChange{ElementID: e.ID, Axis: "h", Before: e.H, After: newE.H},
				)
			}
		default:
			return redesignResult{}, fmt.Errorf("redesign: invalid mode %q", mode)
		}

		out = append(out, newE)
	}

	return redesignResult{
		elements: out,
		changes:  changes,
	}, nil
}

// snap rounds v to the nearest multiple of step.
func snap(v, step float64) float64 {
	if step <= 0 {
		return v
	}
	return float64(int(v/step+0.5)) * step
}
