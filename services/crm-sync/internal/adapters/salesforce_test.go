package adapters

import (
	"context"
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

func newSFConn() registry.Connection {
	return registry.Connection{
		ConnectionID:       "c-sf",
		WorkspaceID:        "w-1",
		Provider:           "salesforce",
		Label:              "client-id",
		AccessTokenCipher:  "client-secret",
		RefreshTokenCipher: "refresh-token-xyz",
		RateLimitPerSec:    15,
		Enabled:            true,
	}
}

// sfServer is a tiny in-memory Salesforce mock: it accepts the
// /services/oauth2/token refresh request, then captures the
// subsequent PATCH to /services/data/.../Contact/Email/{email}.
type sfServer struct {
	tokenCalls  int32
	contactHits int32
	lastAuth    string
	lastEmail   string
	lastBody    string
	failToken   bool
	failContact bool
	retryAfter  string
}

func newSFMock(t *testing.T) (*httptest.Server, *sfServer) {
	t.Helper()
	st := &sfServer{}
	mux := http.NewServeMux()
	mux.HandleFunc("/services/oauth2/token", func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&st.tokenCalls, 1)
		if st.failToken {
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte(`{"error":"invalid_grant"}`))
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"access_token":"AT-1","instance_url":"http://` + t.Name() + `","issued_at":"0"}`))
	})
	mux.HandleFunc("/services/data/v59.0/sobjects/Contact/Email/", func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&st.contactHits, 1)
		st.lastAuth = r.Header.Get("Authorization")
		// Path is "/services/data/v59.0/sobjects/Contact/Email/alice@example.com"
		idx := strings.LastIndex(r.URL.Path, "/")
		st.lastEmail = r.URL.Path[idx+1:]
		buf := make([]byte, 1024)
		n, _ := r.Body.Read(buf)
		st.lastBody = string(buf[:n])
		if st.failContact {
			if st.retryAfter != "" {
				w.Header().Set("Retry-After", st.retryAfter)
			}
			w.WriteHeader(http.StatusTooManyRequests)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})
	srv := httptest.NewServer(mux)
	return srv, st
}

func TestSalesforcePushSuccess(t *testing.T) {
	srv, st := newSFMock(t)
	defer srv.Close()

	a := NewSalesforce(zap.NewNop())
	a.httpClient = &http.Client{Timeout: 5 * time.Second, Transport: redirectTransport(srv.URL)}

	conn := newSFConn()
	rec := newRec()
	require.NoError(t, a.Push(context.Background(), conn, rec))
	require.Equal(t, int32(1), atomic.LoadInt32(&st.tokenCalls))
	require.Equal(t, int32(1), atomic.LoadInt32(&st.contactHits))
	require.Equal(t, "Bearer AT-1", st.lastAuth)
	require.Equal(t, "alice@example.com", st.lastEmail)
	require.Contains(t, st.lastBody, "alice@example.com")
}

func TestSalesforcePushRateLimited(t *testing.T) {
	srv, st := newSFMock(t)
	defer srv.Close()
	st.failContact = true
	st.retryAfter = "2"

	a := NewSalesforce(zap.NewNop())
	a.httpClient = &http.Client{Timeout: 5 * time.Second, Transport: redirectTransport(srv.URL)}

	err := a.Push(context.Background(), newSFConn(), newRec())
	require.Error(t, err)
	var rl *registry.ErrRateLimited
	require.ErrorAs(t, err, &rl)
	require.GreaterOrEqual(t, rl.RetryAfterMs, int64(250))
}

func TestSalesforcePushRefreshesToken(t *testing.T) {
	srv, st := newSFMock(t)
	defer srv.Close()

	a := NewSalesforce(zap.NewNop())
	a.httpClient = &http.Client{Timeout: 5 * time.Second, Transport: redirectTransport(srv.URL)}

	conn := newSFConn()
	require.NoError(t, a.Push(context.Background(), conn, newRec()))
	require.NoError(t, a.Push(context.Background(), conn, newRec()))
	// Both Pushes should reuse the cached bearer (no second refresh).
	require.Equal(t, int32(1), atomic.LoadInt32(&st.tokenCalls))
	require.Equal(t, int32(2), atomic.LoadInt32(&st.contactHits))
}

func TestSalesforcePushTokenFail(t *testing.T) {
	srv, st := newSFMock(t)
	defer srv.Close()
	st.failToken = true

	a := NewSalesforce(zap.NewNop())
	a.httpClient = &http.Client{Timeout: 5 * time.Second, Transport: redirectTransport(srv.URL)}

	err := a.Push(context.Background(), newSFConn(), newRec())
	require.Error(t, err)
	require.Contains(t, err.Error(), "bearer")
}

func TestSalesforceName(t *testing.T) {
	a := NewSalesforce(zap.NewNop())
	require.Equal(t, "salesforce", a.Name())
}

func TestSalesforcePullReturnsEmpty(t *testing.T) {
	a := NewSalesforce(zap.NewNop())
	out, err := a.Pull(context.Background(), newSFConn(), 0)
	require.NoError(t, err)
	require.Empty(t, out)
}
