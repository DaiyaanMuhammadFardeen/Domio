// Package handshake implements the JWT verification and deck ACL check
// performed when a WebSocket client first connects.
package handshake

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	rt "github.com/domio/platform/gen/go/domio/realtime/v1"
	"go.uber.org/zap"

	"github.com/domio/platform/services/realtime-gateway/internal/hlc"
)

var (
	ErrUnauthorized  = errors.New("handshake: JWT verification failed")
	ErrDeckNotFound  = errors.New("handshake: deck not found")
	ErrTenantMismatch = errors.New("handshake: tenant mismatch")
)

// Claims represents the JWT claims relevant to the realtime gateway.
//
// Required claims format for clients minting tokens:
//
//	{
//	  "sub":          "<actor_ulid>",
//	  "actor_id":     "<actor_ulid>",
//	  "deck_id":      "<deck_ulid>",
//	  "session_kind": "interactive" | "service",
//	  "exp":          <unix_epoch_seconds>,
//	  "iat":          <unix_epoch_seconds>
//	}
//
// Header must contain {"alg":"HS256","typ":"JWT"}.
// Signature must be HMAC-SHA256 over "header_b64.payload_b64" using the
// shared JWT_SECRET, encoded as unpadded base64url (base64.RawURLEncoding).
type Claims struct {
	Subject     string `json:"sub"`
	ActorID     string `json:"actor_id"`
	DeckID      string `json:"deck_id"`
	SessionKind string `json:"session_kind"`
	ExpiresAt   int64  `json:"exp"`
	IssuedAt    int64  `json:"iat"`
}

// AllowedSessionKinds is the set of session_kind values accepted by the gateway.
var AllowedSessionKinds = map[string]bool{
	"interactive": true,
	"service":     true,
}

// Verifier verifies JWTs using either a shared secret (HMAC-SHA256) or a JWKS endpoint.
type Verifier struct {
	secret   []byte
	jwksURL  string
	logger   *zap.Logger
	clock    *hlc.Clock
}

// NewVerifier creates a new JWT verifier. Provide either secret or jwksURL (not both).
func NewVerifier(secret, jwksURL string, logger *zap.Logger, clock *hlc.Clock) *Verifier {
	return &Verifier{
		secret:  []byte(secret),
		jwksURL: jwksURL,
		logger:  logger,
		clock:   clock,
	}
}

// Verify validates a JWT token string and returns the decoded claims.
// For production use, replace this with a real JWKS library.
func (v *Verifier) Verify(ctx context.Context, token string) (*Claims, error) {
	if token == "" {
		return nil, ErrUnauthorized
	}

	parts := strings.SplitN(token, ".", 3)
	if len(parts) != 3 {
		return nil, ErrUnauthorized
	}

	// For now, verify HMAC-SHA256 if a secret is configured.
	if len(v.secret) > 0 {
		return v.verifyHMAC(parts)
	}

	// If JWKS is configured, decode without verification (placeholder).
	if v.jwksURL != "" {
		return v.decodeClaims(parts)
	}

	return nil, ErrUnauthorized
}

func (v *Verifier) verifyHMAC(parts []string) (*Claims, error) {
	headerB64, payloadB64, sigB64 := parts[0], parts[1], parts[2]

	// Pin algorithm to HS256 — prevents "alg:none" and algorithm confusion attacks.
	headerJSON, err := base64.RawURLEncoding.DecodeString(headerB64)
	if err != nil {
		return nil, fmt.Errorf("handshake: base64 decode header: %w", err)
	}
	var header struct {
		Alg string `json:"alg"`
	}
	if err := json.Unmarshal(headerJSON, &header); err != nil {
		return nil, fmt.Errorf("handshake: json unmarshal header: %w", err)
	}
	if header.Alg != "HS256" {
		return nil, fmt.Errorf("handshake: unsupported algorithm %q (only HS256 allowed)", header.Alg)
	}

	// Compute expected signature.
	mac := hmac.New(sha256.New, v.secret)
	mac.Write([]byte(headerB64 + "." + payloadB64))
	expectedSig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))

	if !hmac.Equal([]byte(sigB64), []byte(expectedSig)) {
		return nil, ErrUnauthorized
	}

	return v.decodeClaims(parts)
}

func (v *Verifier) decodeClaims(parts []string) (*Claims, error) {
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, fmt.Errorf("handshake: base64 decode: %w", err)
	}

	var claims Claims
	if err := json.Unmarshal(payload, &claims); err != nil {
		return nil, fmt.Errorf("handshake: json unmarshal: %w", err)
	}

	// Check expiry.
	if claims.ExpiresAt > 0 && time.Now().Unix() > claims.ExpiresAt {
		return nil, ErrUnauthorized
	}

	return &claims, nil
}

// ValidateSessionKind checks that the session_kind claim is allowed.
func ValidateSessionKind(kind string) error {
	if kind == "" {
		return nil // no restriction if unset
	}
	if !AllowedSessionKinds[kind] {
		return ErrUnauthorized
	}
	return nil
}

// AuthenticateAndCheckACL performs the full handshake:
// 1. Verify JWT → extract claims
// 2. Validate session_kind
// 3. Check deck ACL (placeholder — in production calls control-plane gRPC)
// 4. Return server's current HLC
func (v *Verifier) AuthenticateAndCheckACL(ctx context.Context, token, deckID string) (*Claims, *rt.HLC, error) {
	claims, err := v.Verify(ctx, token)
	if err != nil {
		return nil, nil, err
	}

	if err := ValidateSessionKind(claims.SessionKind); err != nil {
		return nil, nil, err
	}

	// ACL check: verify the deck exists and the actor has access.
	// In production this calls the control-plane GetBranchHead RPC.
	if claims.DeckID != "" && claims.DeckID != deckID {
		return nil, nil, ErrTenantMismatch
	}

	// Return the server's current HLC.
	return claims, v.clock.Now(), nil
}
