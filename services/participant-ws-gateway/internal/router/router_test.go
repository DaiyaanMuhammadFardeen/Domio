package router_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/domio/platform/services/participant-ws-gateway/internal/bus"
	"github.com/domio/platform/services/participant-ws-gateway/internal/hlc"
	"github.com/domio/platform/services/participant-ws-gateway/internal/observability"
	"github.com/domio/platform/services/participant-ws-gateway/internal/router"
	"github.com/domio/platform/services/participant-ws-gateway/internal/session"
)

func newRouter() *router.Router {
	m := observability.New()
	rec := observability.NewRecorder(m)
	return router.New(router.Config{
		Bus:      bus.New(),
		HLC:      hlc.New(nil),
		Registry: session.New(),
		Peppers:  map[string][]byte{"ws": []byte("p")},
		Metrics:  rec,
	})
}

func TestHealthz(t *testing.T) {
	rt := newRouter()
	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/healthz", nil)
	rt.ServeHTTP(w, req)
	if w.Code != http.StatusOK || w.Body.String() != "ok" {
		t.Fatalf("unexpected: code=%d body=%s", w.Code, w.Body.String())
	}
}

func TestSessionStats_EmptyReturnsZero(t *testing.T) {
	rt := newRouter()
	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/v1/audience/sessions/ABCDEF/stats", nil)
	rt.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	body := w.Body.String()
	if !strings.Contains(body, `"total":0`) {
		t.Fatalf("expected total=0 in body, got %s", body)
	}
}

func TestSessionStats_ReturnsShardCounts(t *testing.T) {
	rt := newRouter()
	// Direct registry writes are not exposed; this test exercises the
	// HTTP path only. End-to-end test lives in cmd/pwg/integration_test.go
	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/v1/audience/sessions/SOMECODE/stats", nil)
	rt.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
}