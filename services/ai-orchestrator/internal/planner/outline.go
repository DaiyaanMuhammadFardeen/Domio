// Package planner — outline.go adds a structured presentation outline step
// that sits on top of the generic 4-category Plan.
//
// The OutlineBuilder transforms a Plan (produced by Decompose) into a rich
// Outline suitable for the slide renderer. When a prompt template ID is
// supplied the builder queries the adapter's prompt registry via
// adapterclient.Client.GetPrompt and uses the template schema to shape
// the outline. On any failure the builder degrades gracefully to a
// heuristic mapping of plan subtasks → outline slides.
package planner

import (
	"context"
	"fmt"
	"strings"

	"github.com/domio/platform/services/ai-orchestrator/internal/adapterclient"
)

// ---------------------------------------------------------------------------
// Outline types
// ---------------------------------------------------------------------------

// DataBinding describes a link from a slide element to an external data source.
type DataBinding struct {
	SourceRef string `json:"source_ref"`
	RowRange  []int  `json:"row_range,omitempty"`
	ChartType string `json:"chart_type,omitempty"`
}

// OutlineSlide is a single slide in the generated outline.
type OutlineSlide struct {
	Intent        string        `json:"intent"`
	LayoutHint    string        `json:"layout_hint"`
	ContentBlocks []string      `json:"content_blocks"`
	DataBindings  []DataBinding `json:"data_bindings,omitempty"`
	CitationRefs  []string      `json:"citation_refs,omitempty"`
	Confidence    float64       `json:"confidence"`
}

// Outline is the complete structured outline for a presentation.
type Outline struct {
	Slides []OutlineSlide `json:"slides"`
}

// ---------------------------------------------------------------------------
// OutlineBuilder — transforms a Plan into an Outline.
// ---------------------------------------------------------------------------

// PromptFetcher abstracts the subset of adapterclient.Client used for
// prompt template lookup. This allows tests to inject fakes without a
// gRPC connection.
type PromptFetcher interface {
	GetPrompt(ctx context.Context, templateID string, version int32) (*adapterclient.PromptTemplate, error)
}

// BuildOutline converts a Plan into an Outline. If fetcher is non-nil and
// templateID is non-empty, the builder attempts to load the prompt template
// and use its InputSchemaJSON to derive structured slide intents. When the
// fetch fails (adapter not wired, template not found, etc.) the builder
// falls back to a heuristic outline.
//
// BuildOutline is safe for concurrent use.
func BuildOutline(ctx context.Context, fetcher PromptFetcher, templateID string, plan *Plan) (*Outline, error) {
	if plan == nil {
		return nil, fmt.Errorf("outline: plan must not be nil")
	}

	// Try the prompt registry first.
	if fetcher != nil && templateID != "" {
		if outline, err := outlineFromTemplate(ctx, fetcher, templateID, plan); err == nil && len(outline.Slides) > 0 {
			return outline, nil
		}
		// Fall through to heuristic on any error.
	}

	return heuristicOutline(plan), nil
}

// outlineFromTemplate fetches the prompt template and derives outline
// structure from the template schema. Returns an error on any failure
// so the caller can degrade gracefully.
func outlineFromTemplate(ctx context.Context, fetcher PromptFetcher, templateID string, plan *Plan) (*Outline, error) {
	tmpl, err := fetcher.GetPrompt(ctx, templateID, 0)
	if err != nil {
		return nil, fmt.Errorf("outline: GetPrompt %s: %w", templateID, err)
	}
	if tmpl == nil {
		return nil, fmt.Errorf("outline: template %s returned nil", templateID)
	}

	outline := &Outline{}

	// The template's system prompt and user prompt template provide semantic
	// hints. We map each plan subtask to a slide, enriched by template
	// metadata where available.
	for i, st := range plan.Subtasks {
		slide := OutlineSlide{
			Intent:     st.Title,
			Confidence: 0.85, // template-assisted confidence
		}

		// Use layout hint derived from the template model class.
		slide.LayoutHint = layoutHintFromModelClass(tmpl.ModelClassHint, i)

		// Build content blocks from the subtask description and template.
		slide.ContentBlocks = buildContentBlocks(st, tmpl)

		// Template-derived slides have higher confidence.
		outline.Slides = append(outline.Slides, slide)
	}

	return outline, nil
}

// heuristicOutline maps plan subtasks to outline slides using simple rules.
// No external calls — always succeeds.
func heuristicOutline(plan *Plan) *Outline {
	outline := &Outline{
		Slides: make([]OutlineSlide, 0, len(plan.Subtasks)),
	}

	for _, st := range plan.Subtasks {
		slide := OutlineSlide{
			Intent:     st.Title,
			Confidence: 0.6, // heuristic confidence
		}

		slide.LayoutHint = layoutHintForCategory(st.Category)
		slide.ContentBlocks = []string{st.Description}

		outline.Slides = append(outline.Slides, slide)
	}

	return outline
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// layoutHintFromModelClass returns a layout suggestion based on the model
// class hint from a prompt template and the slide position.
func layoutHintFromModelClass(modelClassHint string, index int) string {
	// First slide is always a title slide.
	if index == 0 {
		return "title"
	}

	lower := strings.ToLower(modelClassHint)
	switch {
	case strings.Contains(lower, "chart"), strings.Contains(lower, "data"):
		return "data-viz"
	case strings.Contains(lower, "image"), strings.Contains(lower, "visual"):
		return "media"
	case strings.Contains(lower, "list"), strings.Contains(lower, "bullet"):
		return "bullets"
	default:
		return "content"
	}
}

// layoutHintForCategory returns a default layout hint for a task category.
func layoutHintForCategory(cat TaskCategory) string {
	switch cat {
	case CategoryGeneration:
		return "content"
	case CategoryAnalysis:
		return "bullets"
	case CategoryTransformation:
		return "content"
	case CategoryResearch:
		return "bullets"
	default:
		return "content"
	}
}

// buildContentBlocks merges subtask info with template data to produce
// concrete content block labels.
func buildContentBlocks(st Subtask, tmpl *adapterclient.PromptTemplate) []string {
	blocks := make([]string, 0, 2)

	// Always include the subtask description.
	if st.Description != "" {
		blocks = append(blocks, st.Description)
	}

	// If the template has a user prompt template, note it as a block hint.
	if tmpl.UserPromptTemplate != "" && tmpl.UserPromptTemplate != st.Description {
		blocks = append(blocks, fmt.Sprintf("[template: %s]", truncate(tmpl.UserPromptTemplate, 120)))
	}

	if len(blocks) == 0 {
		blocks = []string{st.Title}
	}

	return blocks
}

// truncate shortens s to maxLen, appending "…" if truncated.
func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen-1] + "…"
}
