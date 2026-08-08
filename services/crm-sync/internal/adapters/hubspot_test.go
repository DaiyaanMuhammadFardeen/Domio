package adapters

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"go.uber.org/zap"

	"github.com/domio/platform/services/crm-sync/internal/registry"
)

func newConn() registry.Connection {
	return registry.Connection{
		ConnectionID:      "c-1",
		WorkspaceID:       "w-1",
		Provider:          "hubspot",
		AccessTokenCipher: "secret-token",
		RateLimitPerSec:   100,
		Enabled:           true,
	}
}

func newRec() registry.Record {
	return registry.Record{
		WorkspaceID:  "w-1",
		ConnectionID: "c-1",
		ViewerIDKey:  "v-1",
		EventID:      "e-1",
		EventName:    "view",
		Email:        "alice@example.com",
		FirstName:    "Alice",
	}
}

func TestHubSpotPushSuccess(t *testing.T) {
	var hits int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&hits, 1)
		require.Equal(t, http.MethodPost, r.Method)
		require.Equal(t, "Bearer secret-token", r.Header.Get("Authorization"))
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"id":"12345"}`))
	}))
	defer srv.Close()

	a := NewHubSpot(zap.NewNop())
	// Override the hardcoded HubSpot URL by setting the httpClient to a
	// custom transport that redirects to the test server. Simpler:
	// patch the bucket to be huge and validate request plumbing via
	// the test server (URL swap is below).
	a.httpClient = &http.Client{Timeout: 5 * time.Second, Transport: redirectTransport(srv.URL)}

	conn := newConn()
	rec := newRec()
	require.NoError(t, a.Push(context.Background(), conn, rec))
	require.Equal(t, int32(1), atomic.LoadInt32(&hits))
}

func TestHubSpotPushRateLimit(t *testing.T) {
	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&calls, 1)
		w.Header().Set("Retry-After", "1")
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer srv.Close()

	a := NewHubSpot(zap.NewNop())
	a.httpClient = &http.Client{Timeout: 5 * time.Second, Transport: redirectTransport(srv.URL)}

	conn := newConn()
	err := a.Push(context.Background(), conn, newRec())
	require.Error(t, err)
	var rl *registry.ErrRateLimited
	require.ErrorAs(t, err, &rl)
	require.Greater(t, rl.RetryAfterMs, int64(0))
	require.Equal(t, int32(1), atomic.LoadInt32(&calls))
}

func TestHubSpotPushServerError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(`{"message":"boom"}`))
	}))
	defer srv.Close()

	a := NewHubSpot(zap.NewNop())
	a.httpClient = &http.Client{Timeout: 5 * time.Second, Transport: redirectTransport(srv.URL)}

	conn := newConn()
	err := a.Push(context.Background(), conn, newRec())
	require.Error(t, err)
	require.Contains(t, err.Error(), "500")
}

func TestHubSpotName(t *testing.T) {
	a := NewHubSpot(zap.NewNop())
	require.Equal(t, "hubspot", a.Name())
}

func TestHubSpotPullReturnsEmpty(t *testing.T) {
	a := NewHubSpot(zap.NewNop())
	out, err := a.Pull(context.Background(), newConn(), 0)
	require.NoError(t, err)
	require.Empty(t, out)
}

func TestParseRetryAfterMs(t *testing.T) {
	require.Equal(t, int64(5000), parseRetryAfterMs("5"))
	require.Equal(t, int64(1000), parseRetryAfterMs(""))
	require.Equal(t, int64(1000), parseRetryAfterMs("garbage"))
	// HTTP-date form: 60s in the future.
	future := time.Now().Add(60 * time.Second).UTC().Format(http.TimeFormat)
	got := parseRetryAfterMs(future)
	require.Greater(t, got, int64(0))
	require.LessOrEqual(t, got, int64(70000))
}

// redirectTransport rewrites every request to point at baseURL so a
// hardcoded "https://api.hubapi.com/…" endpoint can be exercised
// against an httptest server.
type rt struct{ base string }

func (r *rt) RoundTrip(req *http.Request) (*http.Response, error) {
	// Rewrite the URL.
	u := *req.URL
	u.Scheme = "http"
	u.Host = r.baseURLHost()
	req2 := req.Clone(req.Context())
	req2.URL = &u
	return http.DefaultTransport.RoundTrip(req2)
}

func (r *rt) baseURLHost() string {
	// base looks like "http://127.0.0.1:43257"
	for i := 7; i < len(r.base); i++ {
		if r.base[i] == ':' {
			return r.base[7:] // strip "http://"
		}
	}
	return r.base[7:]
}

func redirectTransport(base string) http.RoundTripper {
	return &rt{base: base}
}
