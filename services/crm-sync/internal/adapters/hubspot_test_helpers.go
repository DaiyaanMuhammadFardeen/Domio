// Test-only helpers for the HubSpot adapter. Kept in a non-_test.go
// file so the burst test (also non-_test.go? no, _test.go) can share
// the helpers without re-declaring them.
package adapters

import "github.com/domio/platform/services/crm-sync/internal/ratelimit"

// newHubSpotBurstBucketForTest returns a fresh 100-token bucket that
// refills at 10/s — the same shape as the production HubSpot bucket
// but isolated so the burst test can run in parallel with others.
func newHubSpotBurstBucketForTest() *ratelimit.Bucket {
	return ratelimit.New(100, 10)
}

// SetBurstOverrideForTest replaces the adapter's bucket with one
// sized for fast tests.
func (h *HubSpot) SetBurstOverrideForTest(capacity, refillPerSec float64) {
	h.bucket = ratelimit.New(capacity, refillPerSec)
}
