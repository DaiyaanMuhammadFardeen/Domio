package adapters

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"go.uber.org/zap"

	"github.com/domio/platform/services/crm-sync/internal/registry"
)

func newORConn() registry.Connection {
	return registry.Connection{
		ConnectionID:      "c-or",
		WorkspaceID:       "w-1",
		Provider:          "outreach",
		AccessTokenCipher: "or-token",
		RateLimitPerSec:   20,
		Enabled:           true,
	}
}

func TestOutreachPushMailbox(t *testing.T) {
	var hits int32
	var path string
	var body []byte
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&hits, 1)
		path = r.URL.Path
		body, _ = io.ReadAll(r.Body)
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"data":{"id":"42"}}`))
	}))
	defer srv.Close()

	a := NewOutreach(zap.NewNop())
	a.httpClient = &http.Client{Timeout: 5 * time.Second, Transport: redirectTransport(srv.URL)}

	rec := newRec()
	rec.EventName = "view"
	require.NoError(t, a.Push(context.Background(), newORConn(), rec))
	require.Equal(t, int32(1), atomic.LoadInt32(&hits))
	require.True(t, strings.HasSuffix(path, "/mailboxes"), "got path %q", path)
	require.Contains(t, string(body), `"mailbox"`)
	require.Contains(t, string(body), "alice@example.com")
}

func TestOutreachPushSequence(t *testing.T) {
	var hits int32
	var path string
	var body []byte
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&hits, 1)
		path = r.URL.Path
		body, _ = io.ReadAll(r.Body)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"data":{"id":"42"}}`))
	}))
	defer srv.Close()

	a := NewOutreach(zap.NewNop())
	a.httpClient = &http.Client{Timeout: 5 * time.Second, Transport: redirectTransport(srv.URL)}

	rec := newRec()
	rec.EventName = "interaction"
	require.NoError(t, a.Push(context.Background(), newORConn(), rec))
	require.True(t, strings.HasSuffix(path, "/sequences"), "got path %q", path)
	require.Contains(t, string(body), `"sequence"`)
	require.Contains(t, string(body), "interaction")
}

func TestOutreachPushRateLimit(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Retry-After", "1")
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer srv.Close()

	a := NewOutreach(zap.NewNop())
	a.httpClient = &http.Client{Timeout: 5 * time.Second, Transport: redirectTransport(srv.URL)}

	err := a.Push(context.Background(), newORConn(), newRec())
	require.Error(t, err)
	var rl *registry.ErrRateLimited
	require.ErrorAs(t, err, &rl)
	require.Equal(t, int64(1000), rl.RetryAfterMs)
}

func TestOutreachPushServerError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"errors":[{"detail":"bad"}]}`))
	}))
	defer srv.Close()

	a := NewOutreach(zap.NewNop())
	a.httpClient = &http.Client{Timeout: 5 * time.Second, Transport: redirectTransport(srv.URL)}

	err := a.Push(context.Background(), newORConn(), newRec())
	require.Error(t, err)
	require.Contains(t, err.Error(), "400")
}

func TestOutreachName(t *testing.T) {
	a := NewOutreach(zap.NewNop())
	require.Equal(t, "outreach", a.Name())
}

func TestOutreachPullReturnsEmpty(t *testing.T) {
	a := NewOutreach(zap.NewNop())
	out, err := a.Pull(context.Background(), newORConn(), 0)
	require.NoError(t, err)
	require.Empty(t, out)
}
