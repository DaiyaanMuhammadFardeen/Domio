// Package tools contains the six M1 read-only MCP tool handlers.
//
// Each handler is a pure function over the JSON-RPC `params` blob. It
// returns a JSON-serializable result and an error. The gateway wraps
// every tool call with capability assertion + audit emission.
//
// The handlers in M1 are *read-only* and do not require a database
// connection — they work on the deck JSON the caller passes in. This
// is because M1's primary deliverable is the gateway + audit + JSON-RPC
// infrastructure; the tools themselves will be wired to real P12
// tables in M2.
//
// Tool list:
//
//   - lint_deck             — run layout / content lint rules over a deck JSON.
//   - get_provenance        — return the (created_by, ai_run_id, agent_session_id)
//                             provenance tuple for a deck or slide.
//   - semantic_search       — return top-K slides matching a query string,
//                             scored by trigram similarity over slide content.
//   - get_claim_confidence  — return the confidence score + evidence IDs
//                             for a citation claim.
//   - accessibility_audit   — run a11y rules over a deck JSON.
//   - check_freshness       — return whether a data binding is stale.
//
// All six tools share the same M1 contract pattern:
//
//   - params is a JSON object with a "deck_id" (required) and
//     tool-specific fields.
//   - the result is a JSON object with a "tool_version" field that
//     identifies the M1 contract version.
package tools

import (
	"context"

	"github.com/domio/platform/services/mcp-server/internal/auth"
	"github.com/domio/platform/services/mcp-server/internal/registry"
)

// ToolVersion is the M1 contract version baked into every result.
// Bumped when the schema changes in a non-backward-compatible way.
const ToolVersion = "p13-m1-v1"

// ok wraps a payload into the standard M1 success envelope.
func ok(payload map[string]any) map[string]any {
	out := make(map[string]any, len(payload)+1)
	for k, v := range payload {
		out[k] = v
	}
	out["tool_version"] = ToolVersion
	return out
}

// AllTools returns the six M1 tool Specs registered with the gateway.
// Each entry is the canonical entry point that the cmd/mcp-server
// wires into the registry. The handlers are pure functions that take
// raw JSON params and return JSON-serializable results.
func AllTools() []registry.Spec {
	return []registry.Spec{
		{
			Name:            "lint_deck",
			Description:     "Run layout / content lint rules over a deck JSON",
			RequiredScopes:  []auth.CapabilityScope{auth.ScopeReadDeck, auth.ScopeLintDeck},
			InputSchemaPath: "contracts/mcp/tools/lint_deck.input.schema.json",
			OutputSchemaPath: "contracts/mcp/tools/lint_deck.output.schema.json",
			Handle: func(_ context.Context, params []byte) (any, error) {
				return LintDeck(params)
			},
		},
		{
			Name:            "get_provenance",
			Description:     "Return the universal audit quartet for a deck or slide",
			RequiredScopes:  []auth.CapabilityScope{auth.ScopeAuditRead},
			InputSchemaPath: "contracts/mcp/tools/get_provenance.input.schema.json",
			OutputSchemaPath: "contracts/mcp/tools/get_provenance.output.schema.json",
			Handle: func(_ context.Context, params []byte) (any, error) {
				return GetProvenance(params)
			},
		},
		{
			Name:            "semantic_search",
			Description:     "Return top-K slides matching a query, scored by token overlap",
			RequiredScopes:  []auth.CapabilityScope{auth.ScopeSearchDeck, auth.ScopeReadDeck},
			InputSchemaPath: "contracts/mcp/tools/semantic_search.input.schema.json",
			OutputSchemaPath: "contracts/mcp/tools/semantic_search.output.schema.json",
			Handle: func(_ context.Context, params []byte) (any, error) {
				return SemanticSearch(params)
			},
		},
		{
			Name:            "get_claim_confidence",
			Description:     "Return the confidence score + evidence IDs for a citation claim",
			RequiredScopes:  []auth.CapabilityScope{auth.ScopeClaimRead, auth.ScopeReadDeck},
			InputSchemaPath: "contracts/mcp/tools/get_claim_confidence.input.schema.json",
			OutputSchemaPath: "contracts/mcp/tools/get_claim_confidence.output.schema.json",
			Handle: func(_ context.Context, params []byte) (any, error) {
				return GetClaimConfidence(params)
			},
		},
		{
			Name:            "accessibility_audit",
			Description:     "Run WCAG-style a11y rules over a deck JSON",
			RequiredScopes:  []auth.CapabilityScope{auth.ScopeA11yRun, auth.ScopeReadDeck},
			InputSchemaPath: "contracts/mcp/tools/accessibility_audit.input.schema.json",
			OutputSchemaPath: "contracts/mcp/tools/accessibility_audit.output.schema.json",
			Handle: func(_ context.Context, params []byte) (any, error) {
				return AccessibilityAudit(params)
			},
		},
		{
			Name:            "check_freshness",
			Description:     "Report whether a data binding is stale relative to a threshold",
			RequiredScopes:  []auth.CapabilityScope{auth.ScopeClaimRead},
			InputSchemaPath: "contracts/mcp/tools/check_freshness.input.schema.json",
			OutputSchemaPath: "contracts/mcp/tools/check_freshness.output.schema.json",
			Handle: func(_ context.Context, params []byte) (any, error) {
				return CheckFreshness(params)
			},
		},
	}
}
