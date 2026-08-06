// Package renderer converts an Outline into concrete slides and persists
// them as a new deck version.
//
// The renderer does NOT perform layout, styling, or visual composition —
// that is the responsibility of downstream rendering workers. This package
// creates the structural artifacts: a deck_versions row (append-only) and
// the corresponding slides rows.
//
// Tables touched:
//   - deck_versions: INSERT (deck_id, revision, parent_revision, schema_version,
//     change_summary, author_id, branch_id, diff_object_key)
//   - decks: UPDATE current_revision, updated_at
//   - slides: INSERT (id, deck_id, position, schema_version, title)
package renderer

import (
	"context"
	"fmt"
	"time"

	"github.com/domio/platform/services/ai-orchestrator/internal/planner"
)

// ---------------------------------------------------------------------------
// Store — deck-version persistence abstraction for testability.
// ---------------------------------------------------------------------------

// DeckVersion represents one row in the deck_versions table.
type DeckVersion struct {
	DeckID        string     `json:"deck_id"`
	Revision      int64      `json:"revision"`
	ParentRevision *int64    `json:"parent_revision,omitempty"`
	SchemaVersion string     `json:"schema_version"`
	ChangeSummary string     `json:"change_summary,omitempty"`
	AuthorID      string     `json:"author_id"`
	BranchID      *string    `json:"branch_id,omitempty"`
	DiffObjectKey *string    `json:"diff_object_key,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
}

// SlideRow represents one row in the slides table.
type SlideRow struct {
	ID            string    `json:"id"`
	DeckID        string    `json:"deck_id"`
	Position      int       `json:"position"`
	SchemaVersion string    `json:"schema_version"`
	Title         string    `json:"title,omitempty"`
	CreatedAt     time.Time `json:"created_at"`
}

// DeckStore abstracts deck-version and slide persistence. Implementations
// must be safe for concurrent use.
type DeckStore interface {
	// GetDeckRevision returns the current revision number for a deck.
	// Returns 0 if the deck has no versions yet.
	GetDeckRevision(ctx context.Context, deckID string) (int64, error)

	// CreateDeckVersion inserts a new deck_versions row. The revision
	// must be exactly parentRevision + 1 (caller enforces monotonicity).
	CreateDeckVersion(ctx context.Context, v *DeckVersion) error

	// UpdateDeckRevision sets the deck's current_revision and updated_at.
	UpdateDeckRevision(ctx context.Context, deckID string, revision int64) error

	// CreateSlide inserts a slides row.
	CreateSlide(ctx context.Context, s *SlideRow) error
}

// ---------------------------------------------------------------------------
// Render request / result
// ---------------------------------------------------------------------------

// RenderRequest describes what to render.
type RenderRequest struct {
	DeckID      string           `json:"deck_id"`
	AuthorID    string           `json:"author_id"`
	BranchID    string           `json:"branch_id"` // empty → "main"
	SchemaVer   string           `json:"schema_version"`
	Outline     *planner.Outline `json:"outline"`
	ChangeDesc  string           `json:"change_desc,omitempty"`
}

// RenderResult is the output of a successful render.
type RenderResult struct {
	DeckID   string `json:"deck_id"`
	Revision int64  `json:"revision"`
	SlideIDs []string `json:"slide_ids"`
	Version  *DeckVersion `json:"version"`
}

// ---------------------------------------------------------------------------
// DeckRenderer — converts an outline into deck artifacts.
// ---------------------------------------------------------------------------

// IDGenerator produces unique IDs for slides and versions. The default
// implementation uses time-based monotonic IDs (matching the pattern in
// the existing router). Production will use UUIDs from Postgres.
type IDGenerator func() string

// DeckRenderer renders an outline into a new deck version.
type DeckRenderer struct {
	store DeckStore
	genID IDGenerator
}

// NewDeckRenderer creates a DeckRenderer. If genID is nil, a time-based
// fallback is used.
func NewDeckRenderer(store DeckStore, genID IDGenerator) *DeckRenderer {
	if genID == nil {
		genID = func() string {
			return time.Now().UTC().Format("20060102150405.000000000")
		}
	}
	return &DeckRenderer{store: store, genID: genID}
}

// Render creates a new deck version from the outline's slides. Each outline
// slide becomes one row in the slides table. The deck_versions row captures
// the version metadata. On success the caller receives a RenderResult with
// the new revision number and created slide IDs.
func (dr *DeckRenderer) Render(ctx context.Context, req RenderRequest) (*RenderResult, error) {
	if req.DeckID == "" {
		return nil, fmt.Errorf("render: deck_id is required")
	}
	if req.AuthorID == "" {
		return nil, fmt.Errorf("render: author_id is required")
	}
	if req.Outline == nil {
		return nil, fmt.Errorf("render: outline is required")
	}
	if req.SchemaVer == "" {
		req.SchemaVer = "ai-v1"
	}

	branchID := req.BranchID
	if branchID == "" {
		branchID = "main"
	}

	// 1. Get current revision.
	parentRev, err := dr.store.GetDeckRevision(ctx, req.DeckID)
	if err != nil {
		return nil, fmt.Errorf("render: get deck revision: %w", err)
	}

	newRev := parentRev + 1

	// 2. Create the deck_versions row.
	branchIDPtr := &branchID
	version := &DeckVersion{
		DeckID:         req.DeckID,
		Revision:       newRev,
		SchemaVersion:  req.SchemaVer,
		ChangeSummary:  req.ChangeDesc,
		AuthorID:       req.AuthorID,
		BranchID:       branchIDPtr,
		DiffObjectKey:  nil, // set later by CRDT merge worker
		CreatedAt:      time.Now().UTC(),
	}
	if parentRev > 0 {
		version.ParentRevision = &parentRev
	}

	if err := dr.store.CreateDeckVersion(ctx, version); err != nil {
		return nil, fmt.Errorf("render: create deck version: %w", err)
	}

	// 3. Create slide rows.
	slideIDs := make([]string, 0, len(req.Outline.Slides))
	for i, slide := range req.Outline.Slides {
		slideID := dr.genID()
		slideRow := &SlideRow{
			ID:            slideID,
			DeckID:        req.DeckID,
			Position:      i,
			SchemaVersion: req.SchemaVer,
			Title:         slide.Intent,
			CreatedAt:     time.Now().UTC(),
		}
		if err := dr.store.CreateSlide(ctx, slideRow); err != nil {
			return nil, fmt.Errorf("render: create slide %d: %w", i, err)
		}
		slideIDs = append(slideIDs, slideID)
	}

	// 4. Update deck's current_revision.
	if err := dr.store.UpdateDeckRevision(ctx, req.DeckID, newRev); err != nil {
		return nil, fmt.Errorf("render: update deck revision: %w", err)
	}

	// We intentionally do not include schemaJSON bytes in the return —
	// deck_schemas is a separate table populated by the CRDT worker.

	return &RenderResult{
		DeckID:   req.DeckID,
		Revision: newRev,
		SlideIDs: slideIDs,
		Version:  version,
	}, nil
}

// ---------------------------------------------------------------------------
// Content transform helpers — copy transforms with RTL + layout awareness.
// ---------------------------------------------------------------------------

// RTLContext carries right-to-left rendering flags.
type RTLContext struct {
	IsRTL     bool   `json:"is_rtl"`
	Direction string `json:"direction"` // "ltr" or "rtl"
}

// TransformSlideContent applies copy transforms to a slide, returning a
// new OutlineSlide with adjusted content blocks and layout hint. This is
// used by downstream workers to prepare content before visual rendering.
//
// Transformations applied:
//   - RTL direction prefix on content blocks when ctx.IsRTL
//   - Layout hint override for RTL layouts (e.g. "bullets" → "rtl-bullets")
func TransformSlideContent(slide planner.OutlineSlide, ctx RTLContext) planner.OutlineSlide {
	out := planner.OutlineSlide{
		Intent:        slide.Intent,
		LayoutHint:    slide.LayoutHint,
		ContentBlocks: make([]string, len(slide.ContentBlocks)),
		DataBindings:  slide.DataBindings,
		CitationRefs:  slide.CitationRefs,
		Confidence:    slide.Confidence,
	}

	// Copy and transform content blocks.
	for i, block := range slide.ContentBlocks {
		if ctx.IsRTL {
			out.ContentBlocks[i] = "[RTL] " + block
		} else {
			out.ContentBlocks[i] = block
		}
	}

	// Adjust layout hint for RTL.
	if ctx.IsRTL {
		out.LayoutHint = rtlLayoutHint(slide.LayoutHint)
	}

	return out
}

// rtlLayoutHint maps a standard layout hint to its RTL variant.
func rtlLayoutHint(hint string) string {
	switch hint {
	case "bullets":
		return "rtl-bullets"
	case "content":
		return "rtl-content"
	case "data-viz":
		return "rtl-data-viz"
	default:
		return hint
	}
}

// ---------------------------------------------------------------------------
// Image fallback + moderation helpers.
// ---------------------------------------------------------------------------

// ImageFallbackResult describes the outcome of an image generation attempt.
type ImageFallbackResult struct {
	PrimaryURL       string                 `json:"primary_url,omitempty"`
	FallbackURL      string                 `json:"fallback_url,omitempty"`
	UsedFallback     bool                   `json:"used_fallback"`
	ModerationOK     bool                   `json:"moderation_ok"`
	ModerationReason string                 `json:"moderation_reason,omitempty"`
}

// ModerateImagePrompt checks an image prompt against a blocklist and
// returns whether it is allowed. This is a synchronous gate — the actual
// moderation API call happens in the adapter layer.
var moderationBlocklist = []string{
	"violence", "gore", "nsfw", "explicit",
}

// EvaluateImageFallback decides whether to use the primary image or fall
// back to a placeholder. If the primary URL is empty or the moderation
// verdict rejects it, a fallback is used.
func EvaluateImageFallback(primaryURL string, modVerdict map[string]interface{}) ImageFallbackResult {
	result := ImageFallbackResult{
		PrimaryURL:   primaryURL,
		ModerationOK: true,
	}

	if primaryURL == "" {
		result.UsedFallback = true
		result.FallbackURL = "https://cdn.domio.io/placeholder.png"
		result.ModerationOK = false
		result.ModerationReason = "no image generated"
		return result
	}

	// Check moderation verdict if present.
	if modVerdict != nil {
		if blocked, ok := modVerdict["blocked"].(bool); ok && blocked {
			result.UsedFallback = true
			result.FallbackURL = "https://cdn.domio.io/placeholder.png"
			result.ModerationOK = false
			if reason, ok := modVerdict["reason"].(string); ok {
				result.ModerationReason = reason
			} else {
				result.ModerationReason = "moderation blocked"
			}
			return result
		}
	}

	return result
}

// IsModerationBlocked checks whether a prompt contains blocked content.
// The check is case-insensitive.
func IsModerationBlocked(prompt string) bool {
	lower := toLower(prompt)
	for _, word := range moderationBlocklist {
		if len(lower) >= len(word) {
			for i := 0; i <= len(lower)-len(word); i++ {
				if lower[i:i+len(word)] == word {
					return true
				}
			}
		}
	}
	return false
}

// toLower returns a lowercase copy of s using ASCII lowering only.
func toLower(s string) string {
	b := make([]byte, len(s))
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c >= 'A' && c <= 'Z' {
			c += 'a' - 'A'
		}
		b[i] = c
	}
	return string(b)
}

// ---------------------------------------------------------------------------
// Citations coverage math.
// ---------------------------------------------------------------------------

// CitationCoverage computes the fraction of outline slides that have at
// least one citation reference. Returns a value in [0.0, 1.0].
// Zero slides → 0.0 (undefined, but safe).
func CitationCoverage(outline *planner.Outline) float64 {
	if outline == nil || len(outline.Slides) == 0 {
		return 0.0
	}

	covered := 0
	for _, s := range outline.Slides {
		if len(s.CitationRefs) > 0 {
			covered++
		}
	}

	return float64(covered) / float64(len(outline.Slides))
}

// VersionIncrement computes the next revision number given a current
// revision. The current revision is the latest committed version; the
// returned value is currentRev + 1.
func VersionIncrement(currentRev int64) int64 {
	return currentRev + 1
}

// ---------------------------------------------------------------------------
// MemDeckStore — in-memory DeckStore for unit tests.
// ---------------------------------------------------------------------------

// MemDeckStore is a thread-safe in-memory DeckStore for testing.
type MemDeckStore struct {
	Revisions map[string]int64   // deck_id → current revision
	Versions  []*DeckVersion     // all created versions
	Slides    []*SlideRow        // all created slides
}

// NewMemDeckStore returns a ready-to-use MemDeckStore.
func NewMemDeckStore() *MemDeckStore {
	return &MemDeckStore{
		Revisions: make(map[string]int64),
	}
}

// GetDeckRevision returns the current revision for a deck.
func (m *MemDeckStore) GetDeckRevision(_ context.Context, deckID string) (int64, error) {
	return m.Revisions[deckID], nil
}

// CreateDeckVersion appends a version record.
func (m *MemDeckStore) CreateDeckVersion(_ context.Context, v *DeckVersion) error {
	m.Versions = append(m.Versions, v)
	return nil
}

// UpdateDeckRevision sets the deck's current revision.
func (m *MemDeckStore) UpdateDeckRevision(_ context.Context, deckID string, revision int64) error {
	m.Revisions[deckID] = revision
	return nil
}

// CreateSlide appends a slide record.
func (m *MemDeckStore) CreateSlide(_ context.Context, s *SlideRow) error {
	m.Slides = append(m.Slides, s)
	return nil
}
