// Package hmac implements HMAC-SHA256 signature verification for the
// benchmark ingest endpoint. The signing key is set from the
// BENCHMARK_INGEST_KEY environment variable on startup; the same
// key is presented as the `X-Benchmark-Signature` header on every
// ingest request, hex-encoded.
package hmac

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"sync"
)

// ErrNoKey — the signing key has not been set.
var ErrNoKey = errors.New("hmac: ingest signing key not configured")

// ErrInvalidSignature — the signature header does not match the body.
var ErrInvalidSignature = errors.New("hmac: invalid signature")

// SigningKey is the process-wide HMAC-SHA256 key. It is set by
// main() at startup from the BENCHMARK_INGEST_KEY environment
// variable. Tests use SetSigningKey to install a constant key.
var (
	mu      sync.RWMutex
	key     []byte
	keySet  bool
)

// SetSigningKey sets the signing key. Empty key disables
// verification (the ingest endpoint will return 401).
func SetSigningKey(s string) {
	mu.Lock()
	defer mu.Unlock()
	if s == "" {
		key = nil
		keySet = false
		return
	}
	key = []byte(s)
	keySet = true
}

// SigningKeyConfigured returns true if a non-empty key is set.
func SigningKeyConfigured() bool {
	mu.RLock()
	defer mu.RUnlock()
	return keySet
}

// Sign returns the hex-encoded HMAC-SHA256 signature for body using
// the configured key.
func Sign(body []byte) (string, error) {
	mu.RLock()
	defer mu.RUnlock()
	if !keySet {
		return "", ErrNoKey
	}
	mac := hmac.New(sha256.New, key)
	mac.Write(body)
	return hex.EncodeToString(mac.Sum(nil)), nil
}

// Verify checks that signature matches the HMAC-SHA256 of body.
// It uses a constant-time compare and returns ErrInvalidSignature
// on mismatch.
func Verify(body []byte, signature string) error {
	expected, err := Sign(body)
	if err != nil {
		return err
	}
	if len(expected) != len(signature) {
		return ErrInvalidSignature
	}
	var diff byte
	for i := 0; i < len(expected); i++ {
		diff |= expected[i] ^ signature[i]
	}
	if diff != 0 {
		return ErrInvalidSignature
	}
	return nil
}