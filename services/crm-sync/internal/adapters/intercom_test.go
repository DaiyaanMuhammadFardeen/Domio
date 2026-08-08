package adapters

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"go.uber.org/zap"

	"github.com/domio/platform/services/crm-sync/internal/registry"
)

func newICConn() registry.Connection {
	return registry.Connection{
		ConnectionID:      "c-ic",
		WorkspaceID:       "w-1",
		Provider:          "intercom",
		AccessTokenCipher: "ic-token",
		RateLimitPerSec:   10,
		Enabled:           true,
	}
}

func TestIntercomPushSuccess(t *testing.T) {
	var hits int32
	var seenAuth, seenVer string
	var seenBody []byte
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&hits, 1)
		seenAuth = r.Header.Get("Authorization")
		seenVer = r.Header.Get("Intercom-Version")
		seenBody, _ = io.ReadAll(r.Body)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"type":"contact","id":"c_123"}`))
	}))
	defer srv.Close()

	a := NewIntercom(zap.NewNop())
	a.httpClient = &http.Client{Timeout: 5 * time.Second, Transport: redirectTransport(srv.URL)}

	conn := newICConn()
	rec := newRec()
	require.NoError(t, a.Push(context.Background(), conn, rec))
	require.Equal(t, int32(1), atomic.LoadInt32(&hits))
	require.Equal(t, "Bearer ic-token", seenAuth)
	require.Equal(t, "2.11", seenVer)

	var body map[string]interface{}
	require.NoError(t, json.Unmarshal(seenBody, &body))
	require.Equal(t, "user", body["role"])
	require.Equal(t, "v-1", body["external_id"])
	tags, ok := body["tags"].([]interface{})
	require.True(t, ok)
	require.Len(t, tags, 1)
	require.Equal(t, "domio:view", tags[0].(map[string]interface{})["name"])
}

func TestIntercomPushRateLimit(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Retry-After", "3")
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer srv.Close()

	a := NewIntercom(zap.NewNop())
	a.httpClient = &http.Client{Timeout: 5 * time.Second, Transport: redirectTransport(srv.URL)}

	err := a.Push(context.Background(), newICConn(), newRec())
	require.Error(t, err)
	var rl *registry.ErrRateLimited
	require.ErrorAs(t, err, &rl)
	require.Equal(t, int64(3000), rl.RetryAfterMs)
}

func TestIntercomPushServerError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnprocessableEntity)
		_, _ = w.Write([]byte(`{"errors":[{"code":"invalid_email"}]}`))
	}))
	defer srv.Close()

	a := NewIntercom(zap.NewNop())
	a.httpClient = &http.Client{Timeout: 5 * time.Second, Transport: redirectTransport(srv.URL)}

	err := a.Push(context.Background(), newICConn(), newRec())
	require.Error(t, err)
	require.Contains(t, err.Error(), "422")
}

func TestIntercomName(t *testing.T) {
	a := NewIntercom(zap.NewNop())
	require.Equal(t, "intercom", a.Name())
}

func TestIntercomPullReturnsEmpty(t *testing.T) {
	a := NewIntercom(zap.NewNop())
	out, err := a.Pull(context.Background(), newICConn(), 0)
	require.NoError(t, err)
	require.Empty(t, out)
}

func TestJoinNonEmpty(t *testing.T) {
	require.Equal(t, "", joinNonEmpty(" ", ""))
	require.Equal(t, "Alice", joinNonEmpty(" ", "Alice", ""))
	require.Equal(t, "Alice Smith", joinNonEmpty(" ", "Alice", "Smith"))
	require.Equal(t, "Alice Smith Jr", joinNonEmpty(" ", "Alice", "Smith", "Jr"))
}
