// Package secretbroker provides a pluggable interface for retrieving API keys
// and other sensitive credentials for AI providers.
//
// The Broker interface is intentionally minimal: a single Get method. This
// keeps the seam wide enough for future vault, KMS, or rotation-backed
// implementations without requiring code changes in consumers.
package secretbroker

import (
	"context"
	"errors"
	"fmt"
	"os"
)

// ErrNotConfigured is returned when a secret is not available from the
// configured source (e.g. VaultBroker stub when no vault is wired).
var ErrNotConfigured = errors.New("secretbroker: not configured")

// Broker abstracts secret retrieval. Implementations must be safe for
// concurrent use.
type Broker interface {
	// Get returns the secret value for the given key, or an error if the
	// secret is unavailable.
	Get(ctx context.Context, key string) (string, error)
}

// ---------------------------------------------------------------------------
// EnvBroker — reads secrets from environment variables.
// ---------------------------------------------------------------------------

// EnvBroker satisfies Broker by reading from os.Getenv. The key mapping is
// straightforward: broker key is the environment variable name. Common
// well-known keys are exposed as package-level constants.
const (
	KeyOpenAI   = "OPENAI_API_KEY"
	KeyAnthropic = "ANTHROPIC_API_KEY"
	KeyGoogleAI  = "GOOGLE_AI_API_KEY"
	KeyVLLMBase  = "VLLM_BASE_URL"
)

// EnvBroker reads secrets from environment variables.
type EnvBroker struct{}

// NewEnvBroker returns a new EnvBroker.
func NewEnvBroker() *EnvBroker {
	return &EnvBroker{}
}

// Get returns the value of the named environment variable. Returns an error
// if the variable is empty or unset.
func (b *EnvBroker) Get(_ context.Context, key string) (string, error) {
	v := os.Getenv(key)
	if v == "" {
		return "", fmt.Errorf("env %s: %w", key, ErrNotConfigured)
	}
	return v, nil
}

// ---------------------------------------------------------------------------
// VaultBroker — stub for future vault/KMS integration.
// ---------------------------------------------------------------------------

// VaultBroker is a placeholder that returns ErrNotConfigured for every
// request. It satisfies the Broker interface so that the consumer code is
// ready for a real vault backend without code changes.
type VaultBroker struct{}

// NewVaultBroker returns a new VaultBroker stub.
func NewVaultBroker() *VaultBroker {
	return &VaultBroker{}
}

// Get returns ErrNotConfigured. A future implementation will call the
// vault API.
func (b *VaultBroker) Get(_ context.Context, _ string) (string, error) {
	return "", ErrNotConfigured
}
