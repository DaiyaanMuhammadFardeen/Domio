package tools

import (
	"fmt"
	"time"
)

// parseRFC3339 parses a timestamp and returns UTC time. Accepts the
// canonical RFC3339 form (matching the P12 universal audit quartet).
func parseRFC3339(s string) (time.Time, error) {
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		return time.Time{}, fmt.Errorf("not RFC3339: %w", err)
	}
	return t.UTC(), nil
}

// daysSince returns the number of whole days between t and now.
func daysSince(t time.Time) int {
	d := time.Since(t)
	if d < 0 {
		return 0
	}
	return int(d / (24 * time.Hour))
}