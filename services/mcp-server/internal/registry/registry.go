// Package registry maps MCP method names to tool handlers and the
// capability scopes required to invoke them.
//
// The registry is the seam between the gateway (which is tool-agnostic)
// and the tools package (which is tool-specific). Each handler returns
// a JSON-serializable result and an error; the gateway handles JSON-RPC
// envelope construction, capability assertion, and audit emission.
package registry

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"sync"

	"github.com/domio/platform/services/mcp-server/internal/auth"
)

// HandlerFunc is the per-tool implementation. It receives the
// JSON-RPC `params` (already parsed into raw JSON) and returns a
// result that the gateway marshals into a JSON-RPC response.
type HandlerFunc func(ctx context.Context, params []byte) (any, error)

// Spec describes one tool: its handler, the scopes required to
// invoke it, and the JSON Schemas for the input and output.
type Spec struct {
	// Name is the JSON-RPC method name (e.g. "lint_deck").
	Name string
	// Description is a short human-readable summary.
	Description string
	// RequiredScopes is the list of capability scopes the caller
	// must have to invoke this tool. ALL scopes must be present
	// (the gateway uses AssertCapability).
	RequiredScopes []auth.CapabilityScope
	// InputSchemaPath points at the JSON Schema for the params.
	InputSchemaPath string
	// OutputSchemaPath points at the JSON Schema for the result.
	OutputSchemaPath string
	// Handle is the per-tool implementation.
	Handle HandlerFunc
}

// Registry is the lookup table from method name to Spec.
type Registry struct {
	mu    sync.RWMutex
	specs map[string]Spec
}

// New constructs an empty Registry.
func New() *Registry {
	return &Registry{specs: make(map[string]Spec)}
}

// Register adds a Spec to the registry. Returns an error if a spec
// with the same Name has already been registered.
func (r *Registry) Register(s Spec) error {
	if s.Name == "" {
		return errors.New("registry: Spec.Name is required")
	}
	if s.Handle == nil {
		return fmt.Errorf("registry: Spec %q has nil Handle", s.Name)
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, ok := r.specs[s.Name]; ok {
		return fmt.Errorf("registry: tool %q is already registered", s.Name)
	}
	r.specs[s.Name] = s
	return nil
}

// MustRegister panics if Register returns an error. Useful at startup.
func (r *Registry) MustRegister(s Spec) {
	if err := r.Register(s); err != nil {
		panic(err)
	}
}

// Lookup returns the Spec for the given method name. The second return
// value is false if the method is not registered.
func (r *Registry) Lookup(method string) (Spec, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	s, ok := r.specs[method]
	return s, ok
}

// Names returns a sorted list of registered tool names.
func (r *Registry) Names() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]string, 0, len(r.specs))
	for n := range r.specs {
		out = append(out, n)
	}
	sort.Strings(out)
	return out
}

// Specs returns a copy of all registered Specs (for diagnostics).
func (r *Registry) Specs() []Spec {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]Spec, 0, len(r.specs))
	for _, s := range r.specs {
		out = append(out, s)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
}