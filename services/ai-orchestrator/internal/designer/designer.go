// Package designer implements the AI slide designer (feature #111).
//
// The slide designer takes a prompt + brand context and produces 4
// structurally distinct layout options. After the user picks an option
// (or asks for "more like option N"), the package produces another set
// of 4 variants biased toward the chosen option's structure.
//
// Diversity is enforced by a *layout fingerprint* — a coarse signature
// of the structural axes of a layout (header position, column count,
// chart placement, bullet-vs-card, etc.). The diversity check rejects
// any set where two options share the same fingerprint, so the 4
// options are never trivial color variants of one another.
//
// The package is dependency-free: it does not call the AI adapter
// directly. Instead, it exposes OptionGenerator — an interface that
// callers satisfy to plug in their own model adapter / template
// engine. The test suite uses a stub generator.
package designer

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
)

// ---------------------------------------------------------------------------
// Request / response types
// ---------------------------------------------------------------------------

// BrandContext provides brand tokens for layout selection. It is
// optional — passing an empty BrandContext falls back to defaults.
type BrandContext struct {
	Palette     []string `json:"palette,omitempty"`     // hex colors
	Typography  string   `json:"typography,omitempty"`  // "sans-serif", "serif", "mono"
	IllustrationStyle string `json:"illustration_style,omitempty"`
}

// SlidePrompt is the input to the designer.
type SlidePrompt struct {
	Intent        string   `json:"intent"`                  // "comparison of 3 pricing tiers"
	Tone          string   `json:"tone,omitempty"`          // "playful", "professional", "minimal"
	Keywords      []string `json:"keywords,omitempty"`      // e.g. "pricing", "tier"
	Brand         BrandContext `json:"brand,omitempty"`
	ReferenceImage string `json:"reference_image,omitempty"` // optional base64
}

// LayoutOption is one of the 4 returned options.
type LayoutOption struct {
	Index        int               `json:"index"`     // 1..4
	TemplateID   string            `json:"template_id"`
	Title        string            `json:"title"`
	LayoutHint   string            `json:"layout_hint"`
	ContentBlocks []string         `json:"content_blocks"`
	ThumbKind    string            `json:"thumb_kind"` // "preview", "skeleton"
	Fingerprint  string            `json:"fingerprint"` // used for diversity check
	Confidence   float64           `json:"confidence"`
}

// DesignResult is the 4 options returned from one design call.
type DesignResult struct {
	Options    []LayoutOption `json:"options"`
	Selected   int            `json:"selected"`  // index of user-selected option (0 if none)
	MoreLike   int            `json:"more_like"` // index of "more like N" reference (0 if none)
}

// ---------------------------------------------------------------------------
// Generation interface — pluggable model adapter
// ---------------------------------------------------------------------------

// OptionGenerator is the AI-facing seam. Implementations typically
// talk to the adapter service via the gRPC client. The designer
// package never calls models directly; it delegates to the generator
// and post-processes results for diversity.
type OptionGenerator interface {
	// GenerateOptions returns up to `targetCount` candidate layouts for
	// the given prompt. Implementations may return fewer — the designer
	// will top up with deterministic fallback templates.
	GenerateOptions(ctx context.Context, prompt SlidePrompt, targetCount int) ([]LayoutOption, error)

	// GenerateVariants returns up to `targetCount` variants of a
	// chosen layout. The generator is encouraged to mutate the seed
	// layout's structure while keeping its core skeleton.
	GenerateVariants(ctx context.Context, seed LayoutOption, prompt SlidePrompt, targetCount int) ([]LayoutOption, error)
}

// ---------------------------------------------------------------------------
// Designer
// ---------------------------------------------------------------------------

// Designer produces 4 distinct layout options for a slide prompt.
type Designer struct {
	generator OptionGenerator
}

// New returns a Designer backed by the given generator.
func New(g OptionGenerator) *Designer {
	return &Designer{generator: g}
}

// Design returns 4 distinct layout options for the prompt. If the
// candidates returned by the generator have duplicate fingerprints,
// the designer prunes them and tops up with deterministic fallbacks
// so the final set is always 4 structurally distinct layouts.
func (d *Designer) Design(ctx context.Context, prompt SlidePrompt) (*DesignResult, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if d.generator == nil {
		return nil, errors.New("designer: no generator configured")
	}
	if prompt.Intent == "" {
		return nil, errors.New("designer: prompt intent is required")
	}

	candidates, err := d.generator.GenerateOptions(ctx, prompt, 4)
	if err != nil {
		return nil, fmt.Errorf("designer: generate: %w", err)
	}

	options := pickDistinct(candidates, prompt, 4)
	for i := range options {
		options[i].Index = i + 1
	}

	return &DesignResult{Options: options}, nil
}

// MoreLike returns 4 variants structurally biased toward the seed
// option. The seed is `seed` (typically a previously generated option);
// the result is a fresh 4-option set that the user can pick from.
func (d *Designer) MoreLike(ctx context.Context, seed LayoutOption, prompt SlidePrompt) (*DesignResult, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if d.generator == nil {
		return nil, errors.New("designer: no generator configured")
	}

	variants, err := d.generator.GenerateVariants(ctx, seed, prompt, 4)
	if err != nil {
		return nil, fmt.Errorf("designer: more-like: %w", err)
	}
	if len(variants) == 0 {
		return nil, errors.New("designer: more-like: generator returned no candidates")
	}

	options := pickDistinct(variants, prompt, 4)
	for i := range options {
		options[i].Index = i + 1
	}

	return &DesignResult{
		Options:  options,
		MoreLike: seed.Index,
	}, nil
}

// ---------------------------------------------------------------------------
// Diversity check
// ---------------------------------------------------------------------------

// LayoutFingerprint returns a structural fingerprint for a layout
// option. Used by the diversity check to ensure two options are not
// trivial variants of one another.
//
// The fingerprint is composed of three structural axes:
//   - "header-pos": top | center | left
//   - "columns":    1 | 2 | 3 | 4
//   - "media":      none | chart | image | table
func LayoutFingerprint(o LayoutOption) string {
	headerPos := "top"
	columns := "1"
	media := "none"

	// Infer structural axes from the layout hint + content blocks.
	hint := strings.ToLower(o.LayoutHint)
	blocks := strings.ToLower(strings.Join(o.ContentBlocks, " "))

	switch {
	case strings.Contains(hint, "center") || strings.Contains(hint, "hero"):
		headerPos = "center"
	case strings.Contains(hint, "split") || strings.Contains(hint, "side"):
		headerPos = "left"
	}

	switch {
	case strings.Contains(hint, "4-col") || strings.Contains(hint, "four"):
		columns = "4"
	case strings.Contains(hint, "3-col") || strings.Contains(hint, "three"):
		columns = "3"
	case strings.Contains(hint, "2-col") || strings.Contains(hint, "two") || strings.Contains(hint, "split"):
		columns = "2"
	}

	switch {
	case strings.Contains(hint, "data") || strings.Contains(hint, "chart") || strings.Contains(blocks, "chart"):
		media = "chart"
	case strings.Contains(hint, "image") || strings.Contains(hint, "media") || strings.Contains(blocks, "image"):
		media = "image"
	case strings.Contains(hint, "table") || strings.Contains(blocks, "table"):
		media = "table"
	}

	return headerPos + "|" + columns + "|" + media
}

// pickDistinct returns up to `target` structurally distinct options
// from the candidates. If the candidates don't supply enough
// distinct options, the function tops up with deterministic fallback
// templates so the final set always has `target` items.
func pickDistinct(candidates []LayoutOption, prompt SlidePrompt, target int) []LayoutOption {
	if target <= 0 {
		return nil
	}

	seen := make(map[string]struct{}, len(candidates))
	out := make([]LayoutOption, 0, target)

	for _, c := range candidates {
		fp := LayoutFingerprint(c)
		if _, dup := seen[fp]; dup {
			continue
		}
		seen[fp] = struct{}{}
		c.Fingerprint = fp
		out = append(out, c)
		if len(out) == target {
			return out
		}
	}

	// Top up with deterministic fallback templates.
	fallbacks := fallbackTemplatesForPrompt(prompt)
	for _, f := range fallbacks {
		fp := LayoutFingerprint(f)
		if _, dup := seen[fp]; dup {
			continue
		}
		seen[fp] = struct{}{}
		f.Fingerprint = fp
		out = append(out, f)
		if len(out) == target {
			return out
		}
	}

	// If still short (e.g. exhausted), pad with title-only fallbacks.
	i := 0
	for len(out) < target {
		fb := LayoutOption{
			TemplateID:    fmt.Sprintf("fallback-%d", i),
			Title:         prompt.Intent,
			LayoutHint:    fmt.Sprintf("content"),
			ContentBlocks: []string{prompt.Intent},
			Confidence:    0.3,
		}
		fp := LayoutFingerprint(fb)
		if _, dup := seen[fp]; !dup {
			seen[fp] = struct{}{}
			fb.Fingerprint = fp
			out = append(out, fb)
		}
		i++
		if i > 8 {
			// Safety net — give up rather than infinite-loop.
			break
		}
	}

	return out
}

// ---------------------------------------------------------------------------
// Deterministic fallback templates
// ---------------------------------------------------------------------------

// fallbackTemplatesForPrompt returns a small, ordered set of templates
// that the designer falls back to when the generator under-supplies
// distinct options. The set is biased by prompt keywords.
func fallbackTemplatesForPrompt(prompt SlidePrompt) []LayoutOption {
	lower := strings.ToLower(prompt.Intent)
	keywords := strings.ToLower(strings.Join(prompt.Keywords, " "))

	tone := strings.ToLower(prompt.Tone)

	make := func(id, hint, title string, blocks []string, conf float64) LayoutOption {
		return LayoutOption{
			TemplateID:    id,
			Title:         title,
			LayoutHint:    hint,
			ContentBlocks: blocks,
			Confidence:    conf,
		}
	}

	fallbacks := []LayoutOption{
		make("tpl-title-center", "title-center", prompt.Intent, []string{prompt.Intent, "subtitle"}, 0.5),
		make("tpl-bullets", "bullets", prompt.Intent, []string{"point 1", "point 2", "point 3"}, 0.5),
		make("tpl-2col", "2-col", prompt.Intent, []string{"left column", "right column"}, 0.5),
		make("tpl-3col", "3-col", prompt.Intent, []string{"col 1", "col 2", "col 3"}, 0.5),
		make("tpl-data-viz", "data-viz", prompt.Intent, []string{"chart"}, 0.5),
		make("tpl-image", "image", prompt.Intent, []string{"hero image"}, 0.5),
		make("tpl-table", "table", prompt.Intent, []string{"table"}, 0.5),
		make("tpl-quote", "quote", prompt.Intent, []string{"pull quote"}, 0.5),
	}

	// Reorder based on prompt signal.
	switch {
	case strings.Contains(lower, "comparison") || strings.Contains(lower, "compare") || strings.Contains(keywords, "comparison"):
		// lead with 3-col / 4-col / table
		fallbacks = reorder(fallbacks, []string{"tpl-3col", "tpl-4col", "tpl-table", "tpl-2col"})
	case strings.Contains(lower, "stats") || strings.Contains(lower, "metrics") || strings.Contains(keywords, "data"):
		fallbacks = reorder(fallbacks, []string{"tpl-data-viz", "tpl-3col", "tpl-bullets"})
	case strings.Contains(lower, "image") || strings.Contains(lower, "hero") || strings.Contains(lower, "illustration"):
		fallbacks = reorder(fallbacks, []string{"tpl-image", "tpl-title-center", "tpl-quote"})
	case tone == "playful" || tone == "casual":
		fallbacks = reorder(fallbacks, []string{"tpl-image", "tpl-quote", "tpl-bullets", "tpl-title-center"})
	}

	// Add a 4-col fallback if not present.
	has4 := false
	for _, f := range fallbacks {
		if f.TemplateID == "tpl-4col" {
			has4 = true
			break
		}
	}
	if !has4 {
		fallbacks = append(fallbacks, make("tpl-4col", "4-col", prompt.Intent, []string{"c1", "c2", "c3", "c4"}, 0.5))
	}

	return fallbacks
}

// reorder moves ids to the front of the list, preserving the order
// of the moved items and the relative order of the rest.
func reorder(items []LayoutOption, ids []string) []LayoutOption {
	idx := make(map[string]int, len(ids))
	for i, id := range ids {
		idx[id] = i
	}

	sort.SliceStable(items, func(i, j int) bool {
		ii, iok := idx[items[i].TemplateID]
		jj, jok := idx[items[j].TemplateID]
		if iok && jok {
			return ii < jj
		}
		if iok {
			return true
		}
		if jok {
			return false
		}
		return false
	})
	return items
}
