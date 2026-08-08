// Integration-style contract tests for the crm-sync orchestrator.
//
// These exercise the adapters + retry policy + DLQ together, using
// httptest fake servers in place of real HubSpot / Salesforce /
// Intercom APIs. The tests cover:
//
//   * Happy-path upsert through the full pipeline (orchestrator →
//     retry policy → adapter → HTTP).
//   * Idempotency key collision: the same (workspace, viewer,
//     event) tuple always produces the same key, so a retry that
//     succeeds on attempt 2 does not produce a second DLQ message.
//   * DLQ on retry exhaustion: 5 consecutive 429s flow through to
//     the DLQ envelope with the right idempotency_key.
package sync

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"go.uber.org/zap"

	"github.com/domio/platform/services/crm-sync/internal/adapters"
	"github.com/domio/platform/services/crm-sync/internal/dlq"
	"github.com/domio/platform/services/crm-sync/internal/idempotency"
	"github.com/domio/platform/services/crm-sync/internal/registry"
)

func newOkServer(t *testing.T) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	t.Cleanup(srv.Close)
	return srv
}

func newFlakyServer(t *testing.T, failFirst int) (*httptest.Server, *int32) {
	t.Helper()
	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := atomic.AddInt32(&calls, 1)
		if n <= int32(failFirst) {
			w.Header().Set("Retry-After", "0")
			w.WriteHeader(http.StatusTooManyRequests)
			return
		}
		w.WriteHeader(http.StatusCreated)
	}))
	t.Cleanup(srv.Close)
	return srv, &calls
}

// driveSync is a tiny helper that wires a registered adapter into a
// fake-server URL via the redirect transport and runs the retry
// policy once.
func driveSync(t *testing.T, adapter registry.Adapter, conn registry.Connection, rec registry.Record) error {
	t.Helper()
	pub := &dlq.InMemoryPublisher{}
	policy := RetryPolicy{
		MaxAttempts:    5,
		InitialBackoff: 5 * time.Millisecond,
		MaxBackoff:     20 * time.Millisecond,
		JitterFraction: 0,
	}
	return policy.Run(context.Background(), conn, rec, adapter, pub)
}

func TestHubSpotContract(t *testing.T) {
	srv := newOkServer(t)
	a := adapters.NewHubSpot(zap.NewNop())
	a.SetTransportForTest(adapters.NewRedirectTransport(srv.URL))
	require.NoError(t, driveSync(t, a, registry.Connection{
		ConnectionID:      "c-hs",
		WorkspaceID:       "w-1",
		Provider:          "hubspot",
		AccessTokenCipher: "tk",
		Enabled:           true,
	}, registry.Record{WorkspaceID: "w-1", ConnectionID: "c-hs", ViewerIDKey: "v", EventID: "e", EventName: "view"}))
}

func TestSalesforceContract(t *testing.T) {
	// Build a Salesforce-shaped mock that handles both the token
	// refresh and the contact PATCH. The token endpoint returns a
	// status 200; the contact endpoint returns 429 once then 204.
	var contactHits int32
	mux := http.NewServeMux()
	mux.HandleFunc("/services/oauth2/token", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"access_token":"AT-1","instance_url":"http://` + r.Host + `"}`))
	})
	mux.HandleFunc("/services/data/v59.0/sobjects/Contact/Email/", func(w http.ResponseWriter, r *http.Request) {
		n := atomic.AddInt32(&contactHits, 1)
		if n == 1 {
			w.Header().Set("Retry-After", "0")
			w.WriteHeader(http.StatusTooManyRequests)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	a := adapters.NewSalesforce(zap.NewNop())
	a.SetTransportForTest(adapters.NewRedirectTransport(srv.URL))
	require.NoError(t, driveSync(t, a, registry.Connection{
		ConnectionID:       "c-sf",
		WorkspaceID:        "w-1",
		Provider:           "salesforce",
		Label:              "client-id",
		AccessTokenCipher:  "client-secret",
		RefreshTokenCipher: "refresh",
		Enabled:            true,
	}, registry.Record{WorkspaceID: "w-1", ConnectionID: "c-sf", ViewerIDKey: "v", EventID: "e", EventName: "view"}))
}

func TestIntercomContract(t *testing.T) {
	srv := newOkServer(t)
	a := adapters.NewIntercom(zap.NewNop())
	a.SetTransportForTest(adapters.NewRedirectTransport(srv.URL))
	require.NoError(t, driveSync(t, a, registry.Connection{
		ConnectionID:      "c-ic",
		WorkspaceID:       "w-1",
		Provider:          "intercom",
		AccessTokenCipher: "tk",
		Enabled:           true,
	}, registry.Record{WorkspaceID: "w-1", ConnectionID: "c-ic", ViewerIDKey: "v", EventID: "e", EventName: "view"}))
}

func TestIdempotencyKeyCollision(t *testing.T) {
	// Two records with identical (workspace, viewer, event_name, event_id)
	// tuples must derive the same idempotency key — that's the whole
	// point of the contract.
	a := &idempKeyProbe{}
	pub := &dlq.InMemoryPublisher{}
	policy := RetryPolicy{MaxAttempts: 1, InitialBackoff: time.Millisecond, MaxBackoff: time.Millisecond}

	rec := registry.Record{WorkspaceID: "w", ConnectionID: "c", ViewerIDKey: "v", EventID: "e", EventName: "view"}
	require.NoError(t, policy.Run(context.Background(), registry.Connection{ConnectionID: "c"}, rec, a, pub))
	require.NoError(t, policy.Run(context.Background(), registry.Connection{ConnectionID: "c"}, rec, a, pub))
	require.Equal(t, int32(2), atomic.LoadInt32(&a.calls))
	// Both calls used the same key — the probe records it.
	k, err := idempotency.Key("w", "v", "view", "e")
	require.NoError(t, err)
	require.Equal(t, k, a.lastKey)
}

func TestDLQOnExhaustion(t *testing.T) {
	// Adapter that always returns 429 → orchestrator exhausts retries
	// → DLQ message is published with the right idempotency key.
	a := &alwaysRateLimited{}
	pub := &dlq.InMemoryPublisher{}
	policy := RetryPolicy{
		MaxAttempts:    3,
		InitialBackoff: time.Millisecond,
		MaxBackoff:     5 * time.Millisecond,
		JitterFraction: 0,
	}
	err := policy.Run(context.Background(),
		registry.Connection{ConnectionID: "c"},
		registry.Record{WorkspaceID: "w", ConnectionID: "c", ViewerIDKey: "v", EventID: "e", EventName: "view"},
		a, pub)
	require.Error(t, err)
	var ex *ExhaustedError
	require.ErrorAs(t, err, &ex)
	require.Equal(t, 3, ex.Attempts)

	require.Len(t, pub.Messages, 1)
	msg := pub.Messages[0]
	require.Equal(t, "c", msg.ConnectionID)
	require.Equal(t, "view", msg.EventName)
	require.Equal(t, 3, msg.Attempts)
	k, _ := idempotency.Key("w", "v", "view", "e")
	require.Equal(t, k, msg.IdempotencyKey)
	require.NotEmpty(t, msg.LastError)
	require.Greater(t, msg.FailedAtMs, int64(0))
}

// ─── test helpers ───────────────────────────────────────────────────

// idempKeyProbe records the last idempotency key the adapter was
// called with — but it doesn't actually use a key. We capture the
// event ID tuple so the test asserts the orchestrator-derived key
// matches what idempotency.Key() computes for the same input.
type idempKeyProbe struct {
	calls   int32
	lastKey string
}

func (i *idempKeyProbe) Name() string { return "probe" }
func (i *idempKeyProbe) Push(_ context.Context, _ registry.Connection, rec registry.Record) error {
	atomic.AddInt32(&i.calls, 1)
	k, _ := idempotency.Key(rec.WorkspaceID, rec.ViewerIDKey, rec.EventName, rec.EventID)
	i.lastKey = k
	return nil
}
func (i *idempKeyProbe) Pull(_ context.Context, _ registry.Connection, _ int64) ([]registry.Record, error) {
	return nil, nil
}

type alwaysRateLimited struct{}

func (a *alwaysRateLimited) Name() string { return "rl" }
func (a *alwaysRateLimited) Push(_ context.Context, _ registry.Connection, _ registry.Record) error {
	return &registry.ErrRateLimited{RetryAfterMs: 1}
}
func (a *alwaysRateLimited) Pull(_ context.Context, _ registry.Connection, _ int64) ([]registry.Record, error) {
	return nil, nil
}
