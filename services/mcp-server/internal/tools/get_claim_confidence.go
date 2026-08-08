package tools

import (
	"encoding/json"
	"fmt"
)

// GetClaimConfidenceParams is the input to get_claim_confidence.
type GetClaimConfidenceParams struct {
	// ClaimID identifies the claim.
	ClaimID string `json:"claim_id"`
	// DeckID optionally scopes to a deck for context.
	DeckID string `json:"deck_id,omitempty"`
}

// GetClaimConfidenceResult is the result.
type GetClaimConfidenceResult struct {
	ClaimID     string   `json:"claim_id"`
	DeckID      string   `json:"deck_id,omitempty"`
	Score       float64  `json:"score"`
	EvidenceIDs []string `json:"evidence_ids"`
	Disputed    bool     `json:"disputed"`
	VerifiedAt  string   `json:"verified_at,omitempty"`
	Reason      string   `json:"reason,omitempty"`
}

// GetClaimConfidence returns the confidence score + evidence IDs for a
// citation claim. In M1, the score is a deterministic function of the
// claim_id so callers can assert on the wire format.
func GetClaimConfidence(params json.RawMessage) (map[string]any, error) {
	var p GetClaimConfidenceParams
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, fmt.Errorf("get_claim_confidence: invalid params: %w", err)
	}
	if p.ClaimID == "" {
		return nil, fmt.Errorf("get_claim_confidence: claim_id is required")
	}

	// Deterministic score in [0, 1] derived from the claim_id length
	// so different claim IDs produce different scores, and the result
	// is reproducible across calls. M2 will back this with a SQL query
	// against the P12 citation + slide_citation tables.
	score := deterministicScore(p.ClaimID)

	res := GetClaimConfidenceResult{
		ClaimID:     p.ClaimID,
		DeckID:      p.DeckID,
		Score:       score,
		EvidenceIDs: []string{}, // empty in M1
		Disputed:    false,
		VerifiedAt:  "2026-01-01T00:00:00Z",
		Reason:      "mcp-server:m1 stub",
	}
	return ok(map[string]any{
		"claim_id":     res.ClaimID,
		"deck_id":      res.DeckID,
		"score":        res.Score,
		"evidence_ids": res.EvidenceIDs,
		"disputed":     res.Disputed,
		"verified_at":  res.VerifiedAt,
		"reason":       res.Reason,
	}), nil
}

// deterministicScore hashes the claim_id into a [0, 1] score.
func deterministicScore(claimID string) float64 {
	if claimID == "" {
		return 0
	}
	var sum uint64
	for _, c := range claimID {
		sum = sum*131 + uint64(c)
	}
	// Map to [0.5, 1.0] so the score is always non-trivial.
	return 0.5 + float64(sum%500)/1000.0
}