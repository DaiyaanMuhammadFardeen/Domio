// Package auth defines the Principal type and capability scopes
// shared between the gateway and the tool registry. It exists as
// a separate package to avoid a circular import between gateway
// and registry.
package auth

import (
	"context"
	"fmt"
)

// CapabilityScope is one named capability (e.g. "read:deck", "lint:deck").
type CapabilityScope string

// Common capability scopes for M1. Other scopes can be added as
// strings — these are just the well-known identifiers.
const (
	ScopeReadDeck   CapabilityScope = "read:deck"
	ScopeLintDeck   CapabilityScope = "lint:deck"
	ScopeSearchDeck CapabilityScope = "search:deck"
	ScopeAuditRead  CapabilityScope = "audit:read"
	ScopeClaimRead  CapabilityScope = "claim:read"
	ScopeA11yRun    CapabilityScope = "a11y:run"
)

// Principal is the authenticated subject. The gateway attaches a
// Principal to every incoming request's context.
type Principal struct {
	// SubjectID is the user/service ID.
	SubjectID string
	// WorkspaceID is the tenant scope.
	WorkspaceID string
	// Scopes is the set of capability scopes the principal carries.
	Scopes map[CapabilityScope]struct{}
}

// HasScope reports whether the principal carries the named scope.
func (p *Principal) HasScope(scope CapabilityScope) bool {
	if p == nil {
		return false
	}
	_, ok := p.Scopes[scope]
	return ok
}

// HasAllScopes reports whether the principal carries every named scope.
func (p *Principal) HasAllScopes(scopes ...CapabilityScope) bool {
	for _, s := range scopes {
		if !p.HasScope(s) {
			return false
		}
	}
	return true
}

type principalContextKey struct{}

// WithPrincipal attaches a Principal to the context.
func WithPrincipal(ctx context.Context, p *Principal) context.Context {
	return context.WithValue(ctx, principalContextKey{}, p)
}

// PrincipalFromContext returns the Principal attached to the context,
// or nil if there is none.
func PrincipalFromContext(ctx context.Context) *Principal {
	if p, ok := ctx.Value(principalContextKey{}).(*Principal); ok {
		return p
	}
	return nil
}

// ErrMissingScope is returned when a principal lacks a required scope.
type ErrMissingScope struct {
	Principal string
	Scope     CapabilityScope
}

func (e *ErrMissingScope) Error() string {
	return fmt.Sprintf("auth: principal %q missing scope %q", e.Principal, e.Scope)
}

// AssertCapability returns nil if the principal carries every named
// scope, otherwise an *ErrMissingScope listing the first missing scope.
func AssertCapability(p *Principal, scopes ...CapabilityScope) error {
	if p == nil {
		return &ErrMissingScope{Principal: "<nil>", Scope: ""}
	}
	for _, s := range scopes {
		if !p.HasScope(s) {
			return &ErrMissingScope{Principal: p.SubjectID, Scope: s}
		}
	}
	return nil
}