package gateway

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/domio/platform/services/mcp-server/internal/audit"
	"github.com/domio/platform/services/mcp-server/internal/auth"
	"github.com/domio/platform/services/mcp-server/internal/registry"
)

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

type staticAuth struct {
	tokens map[string]*auth.Principal
}

func (s *staticAuth) Authenticate(_ context.Context, token string) (*auth.Principal, error) {
	p, ok := s.tokens[token]
	if !ok {
		return nil, errBadToken
	}
	return p, nil
}

var errBadToken = stringErr("bad token")

type stringErr string

func (e stringErr) Error() string { return string(e) }

func newTestPrincipal() *auth.Principal {
	return &auth.Principal{
		SubjectID:   "u1",
		WorkspaceID: "ws1",
		Scopes: map[auth.CapabilityScope]struct{}{
			auth.ScopeReadDeck:   {},
			auth.ScopeLintDeck:   {},
			auth.ScopeSearchDeck: {},
			auth.ScopeAuditRead:  {},
			auth.ScopeClaimRead:  {},
			auth.ScopeA11yRun:    {},
		},
	}
}

type capturingAudit struct {
	mu     sync.Mutex
	events []audit.Event
}

func (c *capturingAudit) Record(_ context.Context, ev audit.Event) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.events = append(c.events, ev)
	return nil
}

func newTestGateway(t *testing.T, reg *registry.Registry, principal *auth.Principal) (*Gateway, *capturingAudit) {
	t.Helper()
	if principal == nil {
		principal = newTestPrincipal()
	}
	authn := &staticAuth{tokens: map[string]*auth.Principal{"good-token": principal}}
	auditSink := &capturingAudit{}

	// We need a chain-backed audit sink for the gateway to call
	// chain.Build. The Persist fn forwards the signed event into
	// the capturing sink so tests can assert on it.
	chain, err := audit.NewChain([]audit.Key{{
		Kid:          "k1",
		KeyHex:       strings.Repeat("ab", 32),
		RotatedAt:    nowMinus(1 * oneHour),
		ExpiresAt:    nowPlus(24 * oneHour),
		OverlapUntil: nowPlus(24 * oneHour),
	}})
	if err != nil {
		t.Fatal(err)
	}
	sink := &ChainAuditSink{
		Chain: chain,
		Persist: func(ctx context.Context, ev audit.Event) error {
			return auditSink.Record(ctx, ev)
		},
	}

	gw, err := New(Config{
		Authenticator: authn,
		Registry:      reg,
		Audit:         sink,
	})
	if err != nil {
		t.Fatal(err)
	}
	return gw, auditSink
}

// ---------------------------------------------------------------------------
// End-to-end tests
// ---------------------------------------------------------------------------

func TestGatewaySuccessEndToEnd(t *testing.T) {
	reg := registry.New()
	reg.MustRegister(registry.Spec{
		Name: "echo",
		Handle: func(_ context.Context, params []byte) (any, error) {
			var in map[string]any
			_ = json.Unmarshal(params, &in)
			return in, nil
		},
	})
	gw, _ := newTestGateway(t, reg, nil)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/mcp",
		bytes.NewReader([]byte(`{"jsonrpc":"2.0","id":"1","method":"echo","params":{"hello":"world"}}`)))
	req.Header.Set("Authorization", "Bearer good-token")
	gw.Router().ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status=200, got %d", w.Code)
	}
	var resp Response
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if resp.Error != nil {
		t.Errorf("expected no error, got %+v", resp.Error)
	}
	m, ok := resp.Result.(map[string]any)
	if !ok {
		t.Fatalf("expected map result, got %T", resp.Result)
	}
	if m["hello"] != "world" {
		t.Errorf("expected hello=world, got %v", m["hello"])
	}
}

func TestGatewayMissingAuth(t *testing.T) {
	reg := registry.New()
	gw, _ := newTestGateway(t, reg, nil)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/mcp",
		bytes.NewReader([]byte(`{"jsonrpc":"2.0","id":"1","method":"any"}`)))
	gw.Router().ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status=200 (JSON-RPC error), got %d", w.Code)
	}
	var resp Response
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if resp.Error == nil {
		t.Fatal("expected error")
	}
	if resp.Error.Code != CodeUnauthorized {
		t.Errorf("expected code=%d, got %d", CodeUnauthorized, resp.Error.Code)
	}
}

func TestGatewayBadToken(t *testing.T) {
	reg := registry.New()
	gw, _ := newTestGateway(t, reg, nil)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/mcp",
		bytes.NewReader([]byte(`{"jsonrpc":"2.0","id":"1","method":"any"}`)))
	req.Header.Set("Authorization", "Bearer bad-token")
	gw.Router().ServeHTTP(w, req)

	var resp Response
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if resp.Error == nil || resp.Error.Code != CodeUnauthorized {
		t.Errorf("expected unauthorized error, got %+v", resp.Error)
	}
}

func TestGatewayMethodNotFound(t *testing.T) {
	reg := registry.New()
	gw, _ := newTestGateway(t, reg, nil)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/mcp",
		bytes.NewReader([]byte(`{"jsonrpc":"2.0","id":"1","method":"nonexistent"}`)))
	req.Header.Set("Authorization", "Bearer good-token")
	gw.Router().ServeHTTP(w, req)

	var resp Response
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if resp.Error == nil || resp.Error.Code != CodeMethodNotFound {
		t.Errorf("expected method-not-found, got %+v", resp.Error)
	}
}

func TestGatewayMissingCapability(t *testing.T) {
	reg := registry.New()
	reg.MustRegister(registry.Spec{
		Name:           "secret_tool",
		RequiredScopes: []auth.CapabilityScope{auth.ScopeAuditRead},
		Handle: func(_ context.Context, _ []byte) (any, error) {
			return nil, nil
		},
	})
	// Principal has read:deck only — no audit:read.
	limited := &auth.Principal{
		SubjectID:   "u2",
		WorkspaceID: "ws1",
		Scopes: map[auth.CapabilityScope]struct{}{
			auth.ScopeReadDeck: {},
		},
	}
	gw, _ := newTestGateway(t, reg, limited)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/mcp",
		bytes.NewReader([]byte(`{"jsonrpc":"2.0","id":"1","method":"secret_tool"}`)))
	req.Header.Set("Authorization", "Bearer good-token")
	gw.Router().ServeHTTP(w, req)

	var resp Response
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if resp.Error == nil || resp.Error.Code != CodeForbidden {
		t.Errorf("expected forbidden, got %+v", resp.Error)
	}
}

func TestGatewayParseError(t *testing.T) {
	reg := registry.New()
	gw, _ := newTestGateway(t, reg, nil)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/mcp",
		bytes.NewReader([]byte("not json")))
	req.Header.Set("Authorization", "Bearer good-token")
	gw.Router().ServeHTTP(w, req)

	var resp Response
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if resp.Error == nil || resp.Error.Code != CodeParseError {
		t.Errorf("expected parse error, got %+v", resp.Error)
	}
}

func TestGatewayInvalidRequest(t *testing.T) {
	reg := registry.New()
	gw, _ := newTestGateway(t, reg, nil)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/mcp",
		bytes.NewReader([]byte(`{"jsonrpc":"1.0","id":"1","method":"x"}`)))
	req.Header.Set("Authorization", "Bearer good-token")
	gw.Router().ServeHTTP(w, req)

	var resp Response
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if resp.Error == nil {
		t.Fatal("expected error")
	}
}

func TestGatewayNotificationGetsNoResponse(t *testing.T) {
	reg := registry.New()
	called := false
	reg.MustRegister(registry.Spec{
		Name: "ping",
		Handle: func(_ context.Context, _ []byte) (any, error) {
			called = true
			return nil, nil
		},
	})
	gw, _ := newTestGateway(t, reg, nil)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/mcp",
		bytes.NewReader([]byte(`{"jsonrpc":"2.0","id":null,"method":"ping"}`)))
	req.Header.Set("Authorization", "Bearer good-token")
	gw.Router().ServeHTTP(w, req)

	if w.Code != http.StatusNoContent {
		t.Errorf("expected status=204 for notification, got %d", w.Code)
	}
	if !called {
		t.Error("expected handler to be called for notification")
	}
}

func TestGatewayAuditEmitsStartedAndCompleted(t *testing.T) {
	reg := registry.New()
	reg.MustRegister(registry.Spec{
		Name: "echo",
		Handle: func(_ context.Context, _ []byte) (any, error) {
			return map[string]any{"ok": true}, nil
		},
	})
	gw, auditSink := newTestGateway(t, reg, nil)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/mcp",
		bytes.NewReader([]byte(`{"jsonrpc":"2.0","id":"1","method":"echo"}`)))
	req.Header.Set("Authorization", "Bearer good-token")
	gw.Router().ServeHTTP(w, req)

	if len(auditSink.events) != 2 {
		t.Errorf("expected 2 audit events, got %d", len(auditSink.events))
	}
	if len(auditSink.events) >= 1 && auditSink.events[0].EventType != "tool_call.started" {
		t.Errorf("expected first event=tool_call.started, got %s", auditSink.events[0].EventType)
	}
	if len(auditSink.events) >= 2 && auditSink.events[1].EventType != "tool_call.succeeded" {
		t.Errorf("expected second event=tool_call.succeeded, got %s", auditSink.events[1].EventType)
	}
}

func TestGatewayAuditEmitsFailed(t *testing.T) {
	reg := registry.New()
	reg.MustRegister(registry.Spec{
		Name: "fail",
		Handle: func(_ context.Context, _ []byte) (any, error) {
			return nil, errBadToken
		},
	})
	gw, auditSink := newTestGateway(t, reg, nil)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/mcp",
		bytes.NewReader([]byte(`{"jsonrpc":"2.0","id":"1","method":"fail"}`)))
	req.Header.Set("Authorization", "Bearer good-token")
	gw.Router().ServeHTTP(w, req)

	if len(auditSink.events) != 2 {
		t.Fatalf("expected 2 events, got %d", len(auditSink.events))
	}
	if auditSink.events[1].EventType != "tool_call.failed" {
		t.Errorf("expected tool_call.failed, got %s", auditSink.events[1].EventType)
	}
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const oneHour = 60 * 60 * 1_000_000_000 // 1 hour in ns

func nowMinus(d int64) time.Time { return time.Now().Add(-time.Duration(d)) }
func nowPlus(d int64) time.Time  { return time.Now().Add(time.Duration(d)) }
