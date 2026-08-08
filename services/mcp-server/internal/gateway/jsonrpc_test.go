package gateway

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/domio/platform/services/mcp-server/internal/auth"
)

// ---------------------------------------------------------------------------
// Parse tests
// ---------------------------------------------------------------------------

func TestParseRequestValid(t *testing.T) {
	env, err := ParseRequest([]byte(`{"jsonrpc":"2.0","id":"1","method":"lint_deck","params":{"deck_id":"abc"}}`))
	if err != nil {
		t.Fatalf("ParseRequest: %v", err)
	}
	if env.Method != "lint_deck" {
		t.Errorf("expected method=lint_deck, got %s", env.Method)
	}
	if env.JSONRPC != "2.0" {
		t.Errorf("expected jsonrpc=2.0, got %s", env.JSONRPC)
	}
}

func TestParseRequestRejectsEmpty(t *testing.T) {
	_, err := ParseRequest(nil)
	if err == nil {
		t.Fatal("expected error on empty body")
	}
}

func TestParseRequestRejectsNonJSON(t *testing.T) {
	_, err := ParseRequest([]byte("not json"))
	if err == nil {
		t.Fatal("expected error on non-JSON")
	}
}

func TestParseRequestRejectsWrongVersion(t *testing.T) {
	_, err := ParseRequest([]byte(`{"jsonrpc":"1.0","id":"1","method":"x"}`))
	if err == nil {
		t.Fatal("expected error on wrong jsonrpc version")
	}
}

func TestParseRequestRejectsMissingMethod(t *testing.T) {
	_, err := ParseRequest([]byte(`{"jsonrpc":"2.0","id":"1"}`))
	if err == nil {
		t.Fatal("expected error on missing method")
	}
}

func TestParseRequestAcceptsNotificationNullID(t *testing.T) {
	env, err := ParseRequest([]byte(`{"jsonrpc":"2.0","id":null,"method":"ping"}`))
	if err != nil {
		t.Fatalf("ParseRequest: %v", err)
	}
	if !env.IsNotification() {
		t.Error("expected notification")
	}
}

// ---------------------------------------------------------------------------
// Response tests
// ---------------------------------------------------------------------------

func TestNewResponseSuccess(t *testing.T) {
	r := NewResponse(json.RawMessage(`"1"`), map[string]string{"ok": "true"})
	if r.JSONRPC != "2.0" {
		t.Errorf("expected jsonrpc=2.0, got %s", r.JSONRPC)
	}
	if r.Error != nil {
		t.Errorf("expected nil error, got %+v", r.Error)
	}
}

func TestNewErrorResponse(t *testing.T) {
	r := NewErrorResponse(json.RawMessage(`"1"`), CodeMethodNotFound, "not found", map[string]string{"tool": "x"})
	if r.Error == nil {
		t.Fatal("expected error")
	}
	if r.Error.Code != CodeMethodNotFound {
		t.Errorf("expected code=%d, got %d", CodeMethodNotFound, r.Error.Code)
	}
	if r.Error.Message != "not found" {
		t.Errorf("unexpected message: %s", r.Error.Message)
	}
}

// ---------------------------------------------------------------------------
// Capability tests
// ---------------------------------------------------------------------------

func TestAssertCapabilityAllPresent(t *testing.T) {
	p := &Principal{
		SubjectID: "u1",
		Scopes: map[CapabilityScope]struct{}{
			ScopeReadDeck: {},
			ScopeLintDeck: {},
		},
	}
	if err := AssertCapability(p, ScopeReadDeck, ScopeLintDeck); err != nil {
		t.Errorf("expected nil, got %v", err)
	}
}

func TestAssertCapabilityMissing(t *testing.T) {
	p := &Principal{
		SubjectID: "u1",
		Scopes: map[CapabilityScope]struct{}{
			ScopeReadDeck: {},
		},
	}
	err := AssertCapability(p, ScopeReadDeck, ScopeLintDeck)
	if err == nil {
		t.Fatal("expected error")
	}
	var miss *auth.ErrMissingScope
	if !errors.As(err, &miss) {
		t.Errorf("expected ErrMissingScope, got %T", err)
	}
	if miss.Scope != ScopeLintDeck {
		t.Errorf("expected missing scope=lint:deck, got %s", miss.Scope)
	}
}

func TestAssertCapabilityNilPrincipal(t *testing.T) {
	err := AssertCapability(nil, ScopeReadDeck)
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestHasAllScopes(t *testing.T) {
	p := &Principal{
		Scopes: map[CapabilityScope]struct{}{
			ScopeReadDeck: {},
		},
	}
	if !p.HasAllScopes(ScopeReadDeck) {
		t.Error("expected HasAllScopes(ScopeReadDeck) = true")
	}
	if p.HasAllScopes(ScopeReadDeck, ScopeLintDeck) {
		t.Error("expected HasAllScopes = false (missing lint:deck)")
	}
}

// ---------------------------------------------------------------------------
// Problem-detail tests
// ---------------------------------------------------------------------------

func TestWriteProblemSetsContentType(t *testing.T) {
	w := httptest.NewRecorder()
	WriteProblem(w, ProblemDetail{
		Status: http.StatusUnauthorized,
		Code:   "unauthorized",
		Title:  "Unauthorized",
		Detail: "missing bearer token",
	})
	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected status=401, got %d", w.Code)
	}
	if got := w.Header().Get("Content-Type"); got != "application/problem+json" {
		t.Errorf("expected content-type=application/problem+json, got %s", got)
	}
	var p ProblemDetail
	if err := json.Unmarshal(w.Body.Bytes(), &p); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if p.Code != "unauthorized" {
		t.Errorf("expected code=unauthorized, got %s", p.Code)
	}
}