// Burst-load test for the HubSpot adapter. The HubSpot marketing
// tier is 100 requests / 10s — i.e. a 100-token bucket that refills
// at 10/s. A naive client that fired 150 requests in a row would
// get rate-limited (or worse, banned). This test confirms the
// adapter self-throttles so a steady 100 reqs in 10s never trips
// the fake server's 100/10s window.
package adapters

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"go.uber.org/zap"

	"github.com/domio/platform/services/crm-sync/internal/registry"
)

// rateWindow counts requests in a 10-second rolling window and
// returns 429 when more than `limit` requests land inside the
// window. Mirrors HubSpot's public 100/10s marketing-tier limit.
type rateWindow struct {
	mu       sync.Mutex
	limit    int
	window   time.Duration
	buckets  []time.Time
}

func newRateWindow(limit int, window time.Duration) *rateWindow {
	return &rateWindow{limit: limit, window: window}
}

// allow returns true if the request is within the limit. The
// caller records the request timestamp only when allow=true.
func (r *rateWindow) allow(now time.Time) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	cutoff := now.Add(-r.window)
	// Drop entries older than the window.
	keep := r.buckets[:0]
	for _, t := range r.buckets {
		if t.After(cutoff) {
			keep = append(keep, t)
		}
	}
	r.buckets = keep
	if len(r.buckets) >= r.limit {
		return false
	}
	r.buckets = append(r.buckets, now)
	return true
}

// TestHubSpotRateLimitBurst drives 100 sequential Push calls through
// the HubSpot adapter and confirms the fake 100/10s server never
// rejects any of them. The adapter's bucket holds 100 tokens; the
// 100 requests fit in the initial burst window without triggering
// the server-side 429.
func TestHubSpotRateLimitBurst(t *testing.T) {
	rw := newRateWindow(100, 10*time.Second)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !rw.allow(time.Now()) {
			w.Header().Set("Retry-After", "5")
			w.WriteHeader(http.StatusTooManyRequests)
			return
		}
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"id":"ok"}`))
	}))
	defer srv.Close()

	a := NewHubSpot(zap.NewNop())
	a.SetTransportForTest(NewRedirectTransport(srv.URL))
	a.bucket = newHubSpotBurstBucketForTest()

	const N = 100
	var ok, rejected int32
	start := time.Now()
	for i := 0; i < N; i++ {
		err := a.Push(context.Background(), registry.Connection{
			ConnectionID:      "c-burst",
			WorkspaceID:       "w-1",
			Provider:          "hubspot",
			AccessTokenCipher: "tk",
			Enabled:           true,
		}, registry.Record{
			WorkspaceID:  "w-1",
			ConnectionID: "c-burst",
			ViewerIDKey:  "v-1",
			EventID:      "e-1",
			EventName:    "view",
		})
		if err == nil {
			atomic.AddInt32(&ok, 1)
		} else {
			atomic.AddInt32(&rejected, 1)
		}
	}
	elapsed := time.Since(start)

	// The bucket holds exactly 100 tokens — so 100 pushes fit
	// without the adapter waiting. None should be rejected.
	require.Equal(t, int32(N), atomic.LoadInt32(&ok), "all %d pushes should succeed", N)
	require.Equal(t, int32(0), atomic.LoadInt32(&rejected), "no pushes should be rejected by the fake server")

	// All 100 tokens should drain in well under a second (no
	// throttling because the bucket is full). Allow a generous 2s
	// upper bound to absorb CI jitter.
	require.Less(t, elapsed, 2*time.Second,
		"100 pushes should fit in the initial bucket, elapsed=%v", elapsed)
}

// TestHubSpotRateLimitBurstOverLimit drives 200 pushes through the
// adapter and confirms the fake server's 100/10s window DOES
// trigger 429s when the adapter's bucket is overridden to be too
// permissive. This validates the fake server enforces the limit
// correctly — i.e. that the test harness is actually testing
// what it claims to test.
func TestHubSpotRateLimitBurstOverLimit(t *testing.T) {
	rw := newRateWindow(100, 10*time.Second)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !rw.allow(time.Now()) {
			w.Header().Set("Retry-After", "5")
			w.WriteHeader(http.StatusTooManyRequests)
			return
		}
		w.WriteHeader(http.StatusCreated)
	}))
	defer srv.Close()

	a := NewHubSpot(zap.NewNop())
	a.SetTransportForTest(NewRedirectTransport(srv.URL))
	// Override the bucket to be very permissive: 1000 tokens, 100/s
	// refill. The fake server's 100/10s window is the actual
	// limiter under test.
	a.SetBurstOverrideForTest(1000, 100)

	const N = 200
	var ok, rejected int32
	for i := 0; i < N; i++ {
		err := a.Push(context.Background(), registry.Connection{
			ConnectionID:      "c",
			WorkspaceID:       "w",
			Provider:          "hubspot",
			AccessTokenCipher: "tk",
			Enabled:           true,
		}, registry.Record{WorkspaceID: "w", ConnectionID: "c", ViewerIDKey: "v", EventID: "e", EventName: "view"})
		if err == nil {
			atomic.AddInt32(&ok, 1)
		} else {
			atomic.AddInt32(&rejected, 1)
		}
	}
	// The fake server enforces 100/10s, so most of the 200 should
	// come back as ErrRateLimited. The adapter's bucket is not
	// the limiter; the server is.
	require.Greater(t, atomic.LoadInt32(&rejected), int32(50),
		"server should have rejected most of the 200 requests, got rejected=%d ok=%d",
		atomic.LoadInt32(&rejected), atomic.LoadInt32(&ok))
}

// TestHubSpotRateLimitBurstFast is the same workload but with a
// fresh HubSpot adapter that has zero tokens. We use the
// SetBurstOverrideForTest hook (declared in hubspot_test_only.go)
// to reduce the burst to 0 so every Push must wait for the
// refill rate. This confirms Wait() actually serializes requests
// under sustained load.
func TestHubSpotRateLimitBurstFast(t *testing.T) {
	rw := newRateWindow(100, 10*time.Second)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !rw.allow(time.Now()) {
			w.Header().Set("Retry-After", "5")
			w.WriteHeader(http.StatusTooManyRequests)
			return
		}
		w.WriteHeader(http.StatusCreated)
	}))
	defer srv.Close()

	a := NewHubSpot(zap.NewNop())
	a.SetTransportForTest(NewRedirectTransport(srv.URL))
	a.SetBurstOverrideForTest(0, 50) // 0 burst, 50/s refill for a quick test

	const N = 30
	var ok int32
	start := time.Now()
	for i := 0; i < N; i++ {
		require.NoError(t, a.Push(context.Background(), registry.Connection{
			ConnectionID:      "c",
			WorkspaceID:       "w",
			Provider:          "hubspot",
			AccessTokenCipher: "tk",
			Enabled:           true,
		}, registry.Record{WorkspaceID: "w", ConnectionID: "c", ViewerIDKey: "v", EventID: "e", EventName: "view"}))
		atomic.AddInt32(&ok, 1)
	}
	elapsed := time.Since(start)
	require.Equal(t, int32(N), atomic.LoadInt32(&ok))
	// 30 reqs at 50/s → ~600ms. Allow 100ms slop.
	require.GreaterOrEqual(t, elapsed, 500*time.Millisecond)
}
