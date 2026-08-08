package tools

import (
	"encoding/json"
	"fmt"
)

// GetProvenanceParams is the input to get_provenance.
type GetProvenanceParams struct {
	// DeckID identifies the deck.
	DeckID string `json:"deck_id"`
	// SlideID optionally narrows to a single slide. Empty = deck-level.
	SlideID string `json:"slide_id,omitempty"`
}

// GetProvenanceResult is the per-call result.
type GetProvenanceResult struct {
	DeckID         string `json:"deck_id"`
	SlideID        string `json:"slide_id,omitempty"`
	CreatedBy      string `json:"created_by"`
	UpdatedBy      string `json:"updated_by"`
	AirunID        string `json:"ai_run_id"`
	AgentSessionID string `json:"agent_session_id"`
	CreatedAt      string `json:"created_at"`
	UpdatedAt      string `json:"updated_at"`
	Source         string `json:"source"`
}

// GetProvenance returns the universal audit quartet for a deck or slide.
//
// In M1 this returns a deterministic stub so the wire format is
// testable. M2 will back it with a SQL query against the P12 tables
// (deck, slide, ai_run, etc.).
func GetProvenance(params json.RawMessage) (map[string]any, error) {
	var p GetProvenanceParams
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, fmt.Errorf("get_provenance: invalid params: %w", err)
	}
	if p.DeckID == "" {
		return nil, fmt.Errorf("get_provenance: deck_id is required")
	}

	res := GetProvenanceResult{
		DeckID:    p.DeckID,
		SlideID:   p.SlideID,
		CreatedBy: "system:m1-stub",
		UpdatedBy: "system:m1-stub",
		// Deterministic non-empty strings so callers can assert.
		AirunID:        "00000000-0000-0000-0000-000000000000",
		AgentSessionID: "",
		CreatedAt:      "2026-01-01T00:00:00Z",
		UpdatedAt:      "2026-01-01T00:00:00Z",
		Source:         "mcp-server:m1",
	}
	return ok(map[string]any{
		"deck_id":    res.DeckID,
		"slide_id":   res.SlideID,
		"created_by": res.CreatedBy,
		"updated_by": res.UpdatedBy,
		"ai_run_id":  res.AirunID,
		"agent_session_id": res.AgentSessionID,
		"created_at": res.CreatedAt,
		"updated_at": res.UpdatedAt,
		"source":     res.Source,
	}), nil
}