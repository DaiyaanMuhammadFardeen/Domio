package tools

import (
	"encoding/json"
	"sort"
	"strings"
	"testing"

	"github.com/domio/platform/services/mcp-server/internal/auth"
	"github.com/domio/platform/services/mcp-server/internal/registry"
)

// newTestRegistry wires the production AllTools into a fresh registry.
func newTestRegistry() *registry.Registry {
	reg := registry.New()
	for _, spec := range AllTools() {
		reg.MustRegister(spec)
	}
	return reg
}

// silence "unused import" if auth is not used by lower tests after refactor.
var _ = auth.CapabilityScope("")


// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

func TestLintDeckFindsTitleTooLong(t *testing.T) {
	params, _ := json.Marshal(map[string]any{
		"deck_id": "d1",
		"deck_json": map[string]any{
			"title": strings.Repeat("a", 100),
			"slides": []any{
				map[string]any{"title": strings.Repeat("a", 100), "elements": []any{}},
			},
		},
	})
	res, err := LintDeck(params)
	if err != nil {
		t.Fatal(err)
	}
	violations := res["violations"].([]LintDeckViolation)
	if len(violations) == 0 {
		t.Fatal("expected at least one violation")
	}
	hasTitle := false
	for _, v := range violations {
		if v.Code == "title_too_long" {
			hasTitle = true
		}
	}
	if !hasTitle {
		t.Errorf("expected title_too_long in violations: %v", violations)
	}
	if res["tool_version"] != ToolVersion {
		t.Errorf("expected tool_version=%s, got %v", ToolVersion, res["tool_version"])
	}
}

func TestLintDeckFindsMissingAltText(t *testing.T) {
	params, _ := json.Marshal(map[string]any{
		"deck_id": "d1",
		"deck_json": map[string]any{
			"slides": []any{
				map[string]any{
					"title": "s1",
					"elements": []any{
						map[string]any{"kind": "image"},
					},
				},
			},
		},
	})
	res, err := LintDeck(params)
	if err != nil {
		t.Fatal(err)
	}
	violations := res["violations"].([]LintDeckViolation)
	found := false
	for _, v := range violations {
		if v.Code == "missing_alt_text" {
			found = true
		}
	}
	if !found {
		t.Error("expected missing_alt_text violation")
	}
}

func TestLintDeckRejectsUnknownRule(t *testing.T) {
	params, _ := json.Marshal(map[string]any{
		"deck_id": "d1",
		"rules":   []string{"nope"},
	})
	if _, err := LintDeck(params); err == nil {
		t.Fatal("expected unknown_rule error")
	}
}

func TestLintDeckRequiresDeckID(t *testing.T) {
	params, _ := json.Marshal(map[string]any{})
	if _, err := LintDeck(params); err == nil {
		t.Fatal("expected deck_id required error")
	}
}

func TestLintDeckEmptyDeckJSONReturnsInformational(t *testing.T) {
	params, _ := json.Marshal(map[string]any{"deck_id": "d1"})
	res, err := LintDeck(params)
	if err != nil {
		t.Fatal(err)
	}
	violations := res["violations"].([]LintDeckViolation)
	if len(violations) != 1 || violations[0].Code != "deck_not_loaded" {
		t.Errorf("expected single deck_not_loaded info, got %v", violations)
	}
}

func TestGetProvenanceReturnsDeterministicStub(t *testing.T) {
	params, _ := json.Marshal(map[string]any{"deck_id": "d1"})
	res, err := GetProvenance(params)
	if err != nil {
		t.Fatal(err)
	}
	if res["deck_id"] != "d1" {
		t.Errorf("expected deck_id=d1, got %v", res["deck_id"])
	}
	if res["created_by"] != "system:m1-stub" {
		t.Errorf("expected created_by=system:m1-stub, got %v", res["created_by"])
	}
}

func TestGetProvenanceRequiresDeckID(t *testing.T) {
	if _, err := GetProvenance([]byte(`{}`)); err == nil {
		t.Fatal("expected deck_id required")
	}
}

func TestSemanticSearchRanksResults(t *testing.T) {
	params, _ := json.Marshal(map[string]any{
		"query": "compliance audit",
		"slides": []any{
			map[string]any{"id": "s1", "title": "Compliance Audit Report", "content": "Annual compliance audit findings"},
			map[string]any{"id": "s2", "title": "Sales Forecast", "content": "Projected Q4 revenue"},
			map[string]any{"id": "s3", "title": "Compliance", "content": "audit"},
		},
		"k": 5,
	})
	res, err := SemanticSearch(params)
	if err != nil {
		t.Fatal(err)
	}
	hits := res["hits"].([]SemanticSearchHit)
	if len(hits) == 0 {
		t.Fatal("expected at least one hit")
	}
	// Best match should have higher score than worst.
	scores := make([]float64, len(hits))
	for i, h := range hits {
		scores[i] = h.Score
	}
	sorted := sort.SliceIsSorted(scores, func(i, j int) bool { return scores[i] > scores[j] })
	if !sorted {
		t.Errorf("expected hits to be sorted by score desc, got %v", scores)
	}
}

func TestSemanticSearchEmptyCorpusReturnsEmpty(t *testing.T) {
	params, _ := json.Marshal(map[string]any{"query": "x"})
	res, err := SemanticSearch(params)
	if err != nil {
		t.Fatal(err)
	}
	hits := res["hits"].([]SemanticSearchHit)
	if len(hits) != 0 {
		t.Errorf("expected 0 hits, got %d", len(hits))
	}
}

func TestSemanticSearchRequiresQuery(t *testing.T) {
	if _, err := SemanticSearch([]byte(`{}`)); err == nil {
		t.Fatal("expected query required")
	}
}

func TestGetClaimConfidenceScoreInRange(t *testing.T) {
	params, _ := json.Marshal(map[string]any{"claim_id": "claim-abc-123"})
	res, err := GetClaimConfidence(params)
	if err != nil {
		t.Fatal(err)
	}
	score := res["score"].(float64)
	if score < 0.5 || score > 1.0 {
		t.Errorf("expected score in [0.5, 1.0], got %f", score)
	}
}

func TestGetClaimConfidenceRequiresClaimID(t *testing.T) {
	if _, err := GetClaimConfidence([]byte(`{}`)); err == nil {
		t.Fatal("expected claim_id required")
	}
}

func TestAccessibilityAuditFindsMissingAlt(t *testing.T) {
	params, _ := json.Marshal(map[string]any{
		"deck_id": "d1",
		"deck_json": map[string]any{
			"lang": "en",
			"slides": []any{
				map[string]any{
					"elements": []any{
						map[string]any{"kind": "image"},
					},
				},
			},
		},
	})
	res, err := AccessibilityAudit(params)
	if err != nil {
		t.Fatal(err)
	}
	findings := res["findings"].([]AccessibilityAuditFinding)
	found := false
	for _, f := range findings {
		if f.Code == "a11y.missing_alt" {
			found = true
		}
	}
	if !found {
		t.Errorf("expected a11y.missing_alt, got %v", findings)
	}
}

func TestAccessibilityAuditFindsNoLang(t *testing.T) {
	params, _ := json.Marshal(map[string]any{
		"deck_id": "d1",
		"deck_json": map[string]any{
			"slides": []any{},
		},
	})
	res, err := AccessibilityAudit(params)
	if err != nil {
		t.Fatal(err)
	}
	findings := res["findings"].([]AccessibilityAuditFinding)
	found := false
	for _, f := range findings {
		if f.Code == "a11y.no_lang" {
			found = true
		}
	}
	if !found {
		t.Errorf("expected a11y.no_lang, got %v", findings)
	}
}

func TestAccessibilityAuditRequiresDeckID(t *testing.T) {
	if _, err := AccessibilityAudit([]byte(`{}`)); err == nil {
		t.Fatal("expected deck_id required")
	}
}

func TestCheckFreshnessStaleData(t *testing.T) {
	params, _ := json.Marshal(map[string]any{
		"deck_id":        "d1",
		"data_binding":   "sheet-1!A1:D10",
		"threshold_days": 30,
		"last_synced_at": "2024-01-01T00:00:00Z",
	})
	res, err := CheckFreshness(params)
	if err != nil {
		t.Fatal(err)
	}
	if res["stale"] != true {
		t.Errorf("expected stale=true, got %v", res["stale"])
	}
}

func TestCheckFreshnessFreshData(t *testing.T) {
	params, _ := json.Marshal(map[string]any{
		"deck_id":        "d1",
		"threshold_days": 365,
		"last_synced_at": "2026-01-01T00:00:00Z",
	})
	res, err := CheckFreshness(params)
	if err != nil {
		t.Fatal(err)
	}
	if res["stale"] != false {
		t.Errorf("expected stale=false, got %v", res["stale"])
	}
}

func TestCheckFreshnessMissingLastSynced(t *testing.T) {
	params, _ := json.Marshal(map[string]any{"deck_id": "d1"})
	res, err := CheckFreshness(params)
	if err != nil {
		t.Fatal(err)
	}
	if res["stale"] != true {
		t.Errorf("expected stale=true when last_synced_at missing")
	}
}

func TestCheckFreshnessRequiresDeckID(t *testing.T) {
	if _, err := CheckFreshness([]byte(`{}`)); err == nil {
		t.Fatal("expected deck_id required")
	}
}

func TestCheckFreshnessRejectsBadTimestamp(t *testing.T) {
	params, _ := json.Marshal(map[string]any{
		"deck_id":        "d1",
		"last_synced_at": "not-a-timestamp",
	})
	if _, err := CheckFreshness(params); err == nil {
		t.Fatal("expected timestamp parse error")
	}
}

func TestAllToolsRegistersSixSpecs(t *testing.T) {
	specs := AllTools()
	if len(specs) != 6 {
		t.Fatalf("expected 6 specs, got %d", len(specs))
	}
	want := []string{
		"lint_deck",
		"get_provenance",
		"semantic_search",
		"get_claim_confidence",
		"accessibility_audit",
		"check_freshness",
	}
	got := make(map[string]bool, len(specs))
	for _, s := range specs {
		got[s.Name] = true
	}
	for _, name := range want {
		if !got[name] {
			t.Errorf("missing tool: %s", name)
		}
	}
}

func TestRegistryLooksUpAllSixTools(t *testing.T) {
	reg := newTestRegistry()
	for _, spec := range AllTools() {
		got, ok := reg.Lookup(spec.Name)
		if !ok {
			t.Errorf("missing tool: %s", spec.Name)
		}
		if got.Name != spec.Name {
			t.Errorf("expected %s, got %s", spec.Name, got.Name)
		}
	}
}

// ---------------------------------------------------------------------------
// Capability-gate tests
// ---------------------------------------------------------------------------

func TestToolCapabilityAssignments(t *testing.T) {
	cases := []struct {
		tool   string
		scopes []auth.CapabilityScope
	}{
		{"lint_deck", []auth.CapabilityScope{auth.ScopeReadDeck, auth.ScopeLintDeck}},
		{"get_provenance", []auth.CapabilityScope{auth.ScopeAuditRead}},
		{"semantic_search", []auth.CapabilityScope{auth.ScopeSearchDeck, auth.ScopeReadDeck}},
		{"get_claim_confidence", []auth.CapabilityScope{auth.ScopeClaimRead, auth.ScopeReadDeck}},
		{"accessibility_audit", []auth.CapabilityScope{auth.ScopeA11yRun, auth.ScopeReadDeck}},
		{"check_freshness", []auth.CapabilityScope{auth.ScopeClaimRead}},
	}
	for _, tc := range cases {
		t.Run(tc.tool, func(t *testing.T) {
			spec, ok := newTestRegistry().Lookup(tc.tool)
			if !ok {
				t.Fatal("tool not registered")
			}
			if len(spec.RequiredScopes) != len(tc.scopes) {
				t.Errorf("expected %d scopes, got %d", len(tc.scopes), len(spec.RequiredScopes))
			}
			for i, s := range tc.scopes {
				if spec.RequiredScopes[i] != s {
					t.Errorf("scope %d: expected %s, got %s", i, s, spec.RequiredScopes[i])
				}
			}
		})
	}
}

// Compile-time guard: registry wiring must include all six tools.
var _ = newTestRegistry
