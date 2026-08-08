package tools

import (
	"encoding/json"
	"fmt"
)

// CheckFreshnessParams is the input to check_freshness.
type CheckFreshnessParams struct {
	DeckID  string `json:"deck_id"`
	// DataBinding is the binding identifier (e.g. "sheet-1!A1:D10").
	DataBinding string `json:"data_binding,omitempty"`
	// ThresholdDays is the staleness threshold. Defaults to 30.
	ThresholdDays int `json:"threshold_days,omitempty"`
	// LastSyncedAt is the ISO-8601 timestamp of the last sync. If empty,
	// the tool returns "unknown" status.
	LastSyncedAt string `json:"last_synced_at,omitempty"`
}

// CheckFreshnessResult is the result.
type CheckFreshnessResult struct {
	DeckID       string `json:"deck_id"`
	DataBinding  string `json:"data_binding,omitempty"`
	ThresholdDays int    `json:"threshold_days"`
	LastSyncedAt string `json:"last_synced_at,omitempty"`
	AgeDays      int    `json:"age_days,omitempty"`
	Stale        bool   `json:"stale"`
	Reason       string `json:"reason,omitempty"`
}

// CheckFreshness reports whether a data binding is stale relative to a
// threshold. In M1 the freshness is computed from the caller-supplied
// LastSyncedAt; M2 will read it from the P12 ai_freshness_record table.
func CheckFreshness(params json.RawMessage) (map[string]any, error) {
	var p CheckFreshnessParams
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, fmt.Errorf("check_freshness: invalid params: %w", err)
	}
	if p.DeckID == "" {
		return nil, fmt.Errorf("check_freshness: deck_id is required")
	}
	if p.ThresholdDays <= 0 {
		p.ThresholdDays = 30
	}

	res := CheckFreshnessResult{
		DeckID:        p.DeckID,
		DataBinding:   p.DataBinding,
		ThresholdDays: p.ThresholdDays,
		LastSyncedAt:  p.LastSyncedAt,
	}

	if p.LastSyncedAt == "" {
		res.Reason = "last_synced_at not provided"
		return ok(map[string]any{
			"deck_id":        res.DeckID,
			"data_binding":   res.DataBinding,
			"threshold_days": res.ThresholdDays,
			"stale":          true,
			"reason":         res.Reason,
		}), nil
	}

	// Parse the timestamp as best-effort: we accept RFC3339 only in M1.
	t, err := parseRFC3339(p.LastSyncedAt)
	if err != nil {
		return nil, fmt.Errorf("check_freshness: invalid last_synced_at: %w", err)
	}
	ageDays := daysSince(t)
	res.AgeDays = ageDays
	res.Stale = ageDays > p.ThresholdDays
	if res.Stale {
		res.Reason = fmt.Sprintf("data is %d days old (threshold %d)", ageDays, p.ThresholdDays)
	}

	return ok(map[string]any{
		"deck_id":        res.DeckID,
		"data_binding":   res.DataBinding,
		"threshold_days": res.ThresholdDays,
		"last_synced_at": res.LastSyncedAt,
		"age_days":       res.AgeDays,
		"stale":          res.Stale,
		"reason":         res.Reason,
	}), nil
}