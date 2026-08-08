// Package registry is the CRM adapter plugin registry. The crm-sync
// service resolves a connection (workspace_id, provider) to a concrete
// Adapter implementation at startup. New providers are added by
// registering an Adapter constructor in package init() or by the
// caller (e.g. tests).
//
// The registry is keyed by provider name. The provider names match
// the provider enum in infrastructure/postgres/migrations/0061_analytics_crm.up.sql.
package registry

import (
	"context"
	"errors"
	"fmt"
	"sync"
)

// Record is the minimal data shape an Adapter receives. It is
// deliberately decoupled from internal/model so adapters in other
// packages can be unit-tested without a Postgres dependency.
type Record struct {
	WorkspaceID  string                 `json:"workspace_id"`
	ConnectionID string                 `json:"connection_id"`
	ViewerIDKey  string                 `json:"viewer_id_key"`
	EventID      string                 `json:"event_id"`
	EventName    string                 `json:"event_name"`
	Email        string                 `json:"email,omitempty"`
	FirstName    string                 `json:"first_name,omitempty"`
	LastName     string                 `json:"last_name,omitempty"`
	Company      string                 `json:"company,omitempty"`
	Tags         []string               `json:"tags,omitempty"`
	Properties   map[string]string      `json:"properties,omitempty"`
	Extra        map[string]interface{} `json:"extra,omitempty"`
}

// Adapter is the contract every CRM provider implementation must
// satisfy. Push writes a single record to the provider. Pull reads
// modified/created records since the last sync watermark.
//
// Adapters are expected to be safe for concurrent use by the caller
// (the crm-sync worker pool runs each Adapter.Push in its own
// goroutine).
type Adapter interface {
	// Name returns the provider name (e.g. "hubspot").
	Name() string
	// Push writes a record to the provider. It must respect the
	// rate-limit hints declared by the connection.
	Push(ctx context.Context, conn Connection, rec Record) error
	// Pull returns records modified since the given watermark.
	Pull(ctx context.Context, conn Connection, sinceUnixMs int64) ([]Record, error)
}

// Connection is the credential bundle an adapter needs to talk to a
// provider. Encrypted cipher fields are opaque strings the adapter
// never inspects.
type Connection struct {
	ConnectionID        string
	WorkspaceID         string
	Provider            string
	Label               string
	AccessTokenCipher   string
	RefreshTokenCipher  string
	ExpiresAtUnixMs     int64
	RateLimitPerSec     int
	Enabled             bool
}

// Factory builds a new adapter instance per connection. Factories are
// stateless so the registry can call them cheaply.
type Factory func() Adapter

// Registry is a thread-safe map of provider name → Factory.
type Registry struct {
	mu        sync.RWMutex
	factories map[string]Factory
}

// New builds an empty registry.
func New() *Registry {
	return &Registry{factories: make(map[string]Factory)}
}

// Register adds (or replaces) a factory for a provider name.
func (r *Registry) Register(provider string, f Factory) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.factories[provider] = f
}

// Has reports whether a provider is registered.
func (r *Registry) Has(provider string) bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	_, ok := r.factories[provider]
	return ok
}

// Providers returns a sorted list of registered provider names.
func (r *Registry) Providers() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]string, 0, len(r.factories))
	for k := range r.factories {
		out = append(out, k)
	}
	return out
}

// Build returns a fresh adapter instance for the given provider. The
// caller owns the returned instance and may use it concurrently.
func (r *Registry) Build(provider string) (Adapter, error) {
	r.mu.RLock()
	f, ok := r.factories[provider]
	r.mu.RUnlock()
	if !ok {
		return nil, fmt.Errorf("registry: no adapter for provider %q (known: %v)", provider, r.Providers())
	}
	return f(), nil
}

// ErrInvalidRecord is returned by adapters when a record fails
// schema validation for the target provider.
var ErrInvalidRecord = errors.New("registry: invalid record")

// ErrRateLimited is returned by adapters when the provider 429s.
type ErrRateLimited struct {
	RetryAfterMs int64
}

func (e *ErrRateLimited) Error() string {
	return fmt.Sprintf("registry: rate limited, retry after %dms", e.RetryAfterMs)
}
