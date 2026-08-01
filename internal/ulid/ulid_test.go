package ulid

import (
	"regexp"
	"testing"
)

var ulidPattern = regexp.MustCompile("^[0-9A-HJKMNP-TV-Z]{26}$")

func TestNewStringMatchesPattern(t *testing.T) {
	g := New()
	id := g.NewString()
	if !ulidPattern.MatchString(id) {
		t.Fatalf("expected %q to match %s", id, ulidPattern)
	}
	if len(id) != 26 {
		t.Fatalf("expected length 26, got %d (%q)", len(id), id)
	}
}

func TestNewStringMonotonicWithinSameMillisecond(t *testing.T) {
	g := New()
	first := g.NewString()
	second := g.NewString()
	if first == second {
		t.Fatalf("expected strictly different ids, got %q twice", first)
	}
}

func TestNewStringUniquenessAcrossMany(t *testing.T) {
	g := New()
	seen := make(map[string]struct{}, 5000)
	for i := 0; i < 5000; i++ {
		id := g.NewString()
		if _, ok := seen[id]; ok {
			t.Fatalf("collision on %q", id)
		}
		seen[id] = struct{}{}
	}
}

func TestWithWorkerEmbedsIdentifier(t *testing.T) {
	g := New(WithWorker("rt"))
	id := g.NewString()
	if len(id) < 22 || id[20:22] != "rt" {
		t.Fatalf("expected worker suffix 'rt', got %q", id[20:])
	}
}
