package registry

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/domio/platform/services/mcp-server/internal/auth"
)

func TestRegisterAndLookup(t *testing.T) {
	r := New()
	err := r.Register(Spec{
		Name:            "lint_deck",
		Description:     "lint a deck",
		RequiredScopes:  []auth.CapabilityScope{auth.ScopeReadDeck, auth.ScopeLintDeck},
		InputSchemaPath: "contracts/mcp/tools/lint_deck.input.schema.json",
		OutputSchemaPath: "contracts/mcp/tools/lint_deck.output.schema.json",
		Handle: func(_ context.Context, _ []byte) (any, error) {
			return map[string]any{"violations": []any{}}, nil
		},
	})
	if err != nil {
		t.Fatalf("Register: %v", err)
	}

	got, ok := r.Lookup("lint_deck")
	if !ok {
		t.Fatal("expected Lookup to succeed")
	}
	if got.Name != "lint_deck" {
		t.Errorf("expected Name=lint_deck, got %s", got.Name)
	}
}

func TestRegisterRejectsDuplicate(t *testing.T) {
	r := New()
	h := func(_ context.Context, _ []byte) (any, error) { return nil, nil }
	if err := r.Register(Spec{Name: "x", Handle: h}); err != nil {
		t.Fatal(err)
	}
	if err := r.Register(Spec{Name: "x", Handle: h}); err == nil {
		t.Fatal("expected duplicate registration to fail")
	}
}

func TestRegisterRejectsEmptyName(t *testing.T) {
	r := New()
	if err := r.Register(Spec{Name: "", Handle: func(_ context.Context, _ []byte) (any, error) { return nil, nil }}); err == nil {
		t.Fatal("expected empty Name to fail")
	}
}

func TestRegisterRejectsNilHandler(t *testing.T) {
	r := New()
	if err := r.Register(Spec{Name: "x"}); err == nil {
		t.Fatal("expected nil Handle to fail")
	}
}

func TestNamesIsSorted(t *testing.T) {
	r := New()
	h := func(_ context.Context, _ []byte) (any, error) { return nil, nil }
	_ = r.Register(Spec{Name: "zeta", Handle: h})
	_ = r.Register(Spec{Name: "alpha", Handle: h})
	_ = r.Register(Spec{Name: "mike", Handle: h})
	got := r.Names()
	want := []string{"alpha", "mike", "zeta"}
	if len(got) != len(want) {
		t.Fatalf("expected %v, got %v", want, got)
	}
	for i := range got {
		if got[i] != want[i] {
			t.Errorf("at %d: expected %s, got %s", i, want[i], got[i])
		}
	}
}

func TestHandlerReturnsResult(t *testing.T) {
	r := New()
	_ = r.Register(Spec{
		Name: "echo",
		Handle: func(_ context.Context, params []byte) (any, error) {
			var in map[string]any
			if err := json.Unmarshal(params, &in); err != nil {
				return nil, err
			}
			return in, nil
		},
	})
	spec, _ := r.Lookup("echo")
	out, err := spec.Handle(context.Background(), []byte(`{"hello":"world"}`))
	if err != nil {
		t.Fatal(err)
	}
	m, ok := out.(map[string]any)
	if !ok {
		t.Fatalf("expected map, got %T", out)
	}
	if m["hello"] != "world" {
		t.Errorf("expected hello=world, got %v", m["hello"])
	}
}

func TestHandlerReturnsError(t *testing.T) {
	r := New()
	want := errors.New("boom")
	_ = r.Register(Spec{
		Name: "fail",
		Handle: func(_ context.Context, _ []byte) (any, error) {
			return nil, want
		},
	})
	spec, _ := r.Lookup("fail")
	_, err := spec.Handle(context.Background(), []byte(`{}`))
	if !errors.Is(err, want) {
		t.Errorf("expected errors.Is(boom), got %v", err)
	}
}

func TestSpecsReturnsSortedCopy(t *testing.T) {
	r := New()
	h := func(_ context.Context, _ []byte) (any, error) { return nil, nil }
	_ = r.Register(Spec{Name: "zeta", Handle: h})
	_ = r.Register(Spec{Name: "alpha", Handle: h})
	specs := r.Specs()
	if specs[0].Name != "alpha" {
		t.Errorf("expected sorted first=alpha, got %s", specs[0].Name)
	}
}