package gateway

import (
	"context"

	"github.com/domio/platform/services/mcp-server/internal/auth"
)

// Re-exports for callers that prefer the gateway-style namespace.
// The canonical types live in the auth package.
type (
	// CapabilityScope is re-exported from internal/auth.
	CapabilityScope = auth.CapabilityScope
	// Principal is re-exported from internal/auth.
	Principal = auth.Principal
	// ErrMissingScope is re-exported from internal/auth.
	ErrMissingScope = auth.ErrMissingScope
)

// Common capability scope identifiers re-exported for callers that
// want to use them as gateway.ScopeReadDeck etc.
const (
	ScopeReadDeck   = auth.ScopeReadDeck
	ScopeLintDeck   = auth.ScopeLintDeck
	ScopeSearchDeck = auth.ScopeSearchDeck
	ScopeAuditRead  = auth.ScopeAuditRead
	ScopeClaimRead  = auth.ScopeClaimRead
	ScopeA11yRun    = auth.ScopeA11yRun
)

// WithPrincipal attaches a Principal to the context. Re-exported.
func WithPrincipal(ctx context.Context, p *auth.Principal) context.Context {
	return auth.WithPrincipal(ctx, p)
}

// PrincipalFromContext returns the Principal attached to the context.
// Re-exported.
func PrincipalFromContext(ctx context.Context) *auth.Principal {
	return auth.PrincipalFromContext(ctx)
}

// AssertCapability returns nil if the principal carries every named
// scope. Re-exported.
func AssertCapability(p *auth.Principal, scopes ...auth.CapabilityScope) error {
	return auth.AssertCapability(p, scopes...)
}
