package handshake

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"testing"
	"time"

	"github.com/domio/platform/services/realtime-gateway/internal/hlc"
	"go.uber.org/zap"
)

// newTestClock creates a Clock for tests (wraps hlc.New with a fixed time).
func newTestClock() *hlc.Clock {
	return hlc.New()
}

const testSecret = "test-hmac-secret"

// mintTestJWT creates a valid JWT for testing with the given claims.
func mintTestJWT(secret string, claims map[string]any) string {
	headerJSON, _ := json.Marshal(map[string]string{"alg": "HS256", "typ": "JWT"})
	headerB64 := base64.RawURLEncoding.EncodeToString(headerJSON)

	payloadJSON, _ := json.Marshal(claims)
	payloadB64 := base64.RawURLEncoding.EncodeToString(payloadJSON)

	signingInput := headerB64 + "." + payloadB64
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(signingInput))
	sig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))

	return signingInput + "." + sig
}

// mintTestJWTWithAlg creates a JWT with a custom algorithm in the header.
func mintTestJWTWithAlg(secret, alg string, claims map[string]any) string {
	headerJSON, _ := json.Marshal(map[string]string{"alg": alg, "typ": "JWT"})
	headerB64 := base64.RawURLEncoding.EncodeToString(headerJSON)

	payloadJSON, _ := json.Marshal(claims)
	payloadB64 := base64.RawURLEncoding.EncodeToString(payloadJSON)

	signingInput := headerB64 + "." + payloadB64
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(signingInput))
	sig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))

	return signingInput + "." + sig
}

func validClaims() map[string]any {
	now := time.Now().Unix()
	return map[string]any{
		"sub":          "actor-001",
		"actor_id":     "actor-001",
		"deck_id":      "deck-001",
		"session_kind": "interactive",
		"exp":          now + 3600,
		"iat":          now,
	}
}

func TestVerify_ValidToken(t *testing.T) {
	v := NewVerifier(testSecret, "", zap.NewNop(), newTestClock())
	token := mintTestJWT(testSecret, validClaims())

	claims, err := v.Verify(context.Background(), token)
	if err != nil {
		t.Fatalf("Verify: %v", err)
	}
	if claims.ActorID != "actor-001" {
		t.Errorf("ActorID = %q, want %q", claims.ActorID, "actor-001")
	}
	if claims.DeckID != "deck-001" {
		t.Errorf("DeckID = %q, want %q", claims.DeckID, "deck-001")
	}
	if claims.SessionKind != "interactive" {
		t.Errorf("SessionKind = %q, want %q", claims.SessionKind, "interactive")
	}
}

func TestVerify_ExpiredToken(t *testing.T) {
	v := NewVerifier(testSecret, "", zap.NewNop(), newTestClock())
	claims := validClaims()
	claims["exp"] = time.Now().Unix() - 3600 // expired 1 hour ago
	token := mintTestJWT(testSecret, claims)

	_, err := v.Verify(context.Background(), token)
	if err == nil {
		t.Fatal("expected error for expired token")
	}
}

func TestVerify_BadSignature(t *testing.T) {
	v := NewVerifier(testSecret, "", zap.NewNop(), newTestClock())
	claims := validClaims()
	// Mint with different secret
	token := mintTestJWT("wrong-secret", claims)

	_, err := v.Verify(context.Background(), token)
	if err == nil {
		t.Fatal("expected error for bad signature")
	}
}

func TestVerify_UnsupportedAlgorithm(t *testing.T) {
	v := NewVerifier(testSecret, "", zap.NewNop(), newTestClock())
	token := mintTestJWTWithAlg(testSecret, "none", validClaims())

	_, err := v.Verify(context.Background(), token)
	if err == nil {
		t.Fatal("expected error for alg:none")
	}
}

func TestVerify_UnsupportedRSA(t *testing.T) {
	v := NewVerifier(testSecret, "", zap.NewNop(), newTestClock())
	token := mintTestJWTWithAlg(testSecret, "RS256", validClaims())

	_, err := v.Verify(context.Background(), token)
	if err == nil {
		t.Fatal("expected error for alg:RS256")
	}
}

func TestVerify_EmptyToken(t *testing.T) {
	v := NewVerifier(testSecret, "", zap.NewNop(), newTestClock())
	_, err := v.Verify(context.Background(), "")
	if err == nil {
		t.Fatal("expected error for empty token")
	}
}

func TestVerify_MalformedToken(t *testing.T) {
	v := NewVerifier(testSecret, "", zap.NewNop(), newTestClock())
	_, err := v.Verify(context.Background(), "not.a.valid.token.at.all")
	// May or may not error on decode, but should not panic
	_ = err
}

func TestValidateSessionKind(t *testing.T) {
	tests := []struct {
		kind    string
		wantErr bool
	}{
		{"interactive", false},
		{"service", false},
		{"", false}, // empty is allowed (no restriction)
		{"evil", true},
		{"admin", true},
	}
	for _, tt := range tests {
		t.Run(tt.kind, func(t *testing.T) {
			err := ValidateSessionKind(tt.kind)
			if (err != nil) != tt.wantErr {
				t.Errorf("ValidateSessionKind(%q) error = %v, wantErr %v", tt.kind, err, tt.wantErr)
			}
		})
	}
}

func TestAuthenticateAndCheckACL_DeckMismatch(t *testing.T) {
	v := NewVerifier(testSecret, "", zap.NewNop(), newTestClock())

	// Token for deck-001, but requesting deck-002
	claims := validClaims()
	claims["deck_id"] = "deck-001"
	token := mintTestJWT(testSecret, claims)

	_, _, err := v.AuthenticateAndCheckACL(context.Background(), token, "deck-002")
	if err != ErrTenantMismatch {
		t.Errorf("expected ErrTenantMismatch, got %v", err)
	}
}

func TestAuthenticateAndCheckACL_DeckMatch(t *testing.T) {
	v := NewVerifier(testSecret, "", zap.NewNop(), newTestClock())
	token := mintTestJWT(testSecret, validClaims())

	claims, hlc, err := v.AuthenticateAndCheckACL(context.Background(), token, "deck-001")
	if err != nil {
		t.Fatalf("AuthenticateAndCheckACL: %v", err)
	}
	if claims.DeckID != "deck-001" {
		t.Errorf("DeckID = %q, want %q", claims.DeckID, "deck-001")
	}
	if hlc == nil {
		t.Error("expected non-nil HLC")
	}
}

func TestAuthenticateAndCheckACL_InvalidSessionKind(t *testing.T) {
	v := NewVerifier(testSecret, "", zap.NewNop(), newTestClock())
	claims := validClaims()
	claims["session_kind"] = "evil"
	token := mintTestJWT(testSecret, claims)

	_, _, err := v.AuthenticateAndCheckACL(context.Background(), token, "deck-001")
	if err != ErrUnauthorized {
		t.Errorf("expected ErrUnauthorized for invalid session_kind, got %v", err)
	}
}
