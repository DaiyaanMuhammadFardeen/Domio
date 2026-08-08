package audit

import (
	"errors"
	"strings"
	"sync"
	"testing"
	"time"
)

// testKey returns a deterministic 32-byte hex key for tests.
func testKey(kid string) Key {
	return Key{
		Kid:          kid,
		KeyHex:       strings.Repeat("ab", 32), // 32 bytes hex
		RotatedAt:    time.Now().Add(-1 * time.Hour),
		ExpiresAt:    time.Now().Add(24 * time.Hour),
		OverlapUntil: time.Now().Add(24 * time.Hour),
	}
}

func TestNewChainRejectsBadKeySize(t *testing.T) {
	_, err := NewChain([]Key{{Kid: "k1", KeyHex: "abcd"}})
	if !errors.Is(err, ErrKeyInvalidSize) {
		t.Fatalf("expected ErrKeyInvalidSize, got %v", err)
	}
}

func TestNewChainAcceptsValidKey(t *testing.T) {
	c, err := NewChain([]Key{testKey("k1")})
	if err != nil {
		t.Fatalf("NewChain: %v", err)
	}
	if c == nil {
		t.Fatal("nil chain")
	}
}

func TestBuildProducesChainedEvents(t *testing.T) {
	c, err := NewChain([]Key{testKey("k1")})
	if err != nil {
		t.Fatal(err)
	}

	in := BuildInput{
		WorkspaceID: "ws1",
		EventType:   "tool_call.started",
		Payload:     map[string]any{"tool": "lint_deck"},
	}
	ev1, err := c.Build(in)
	if err != nil {
		t.Fatalf("Build ev1: %v", err)
	}
	if ev1.Seq != 1 {
		t.Errorf("expected seq=1, got %d", ev1.Seq)
	}
	if ev1.PrevHash != GenesisHash {
		t.Errorf("expected prev_hash=%s (genesis), got %s", GenesisHash, ev1.PrevHash)
	}
	if ev1.Hash == "" {
		t.Error("hash should be set")
	}
	if err := c.Verify(ev1, GenesisHash); err != nil {
		t.Errorf("Verify ev1: %v", err)
	}
	c.Commit(ev1)

	ev2, err := c.Build(in)
	if err != nil {
		t.Fatalf("Build ev2: %v", err)
	}
	if ev2.Seq != 2 {
		t.Errorf("expected seq=2, got %d", ev2.Seq)
	}
	if ev2.PrevHash != ev1.Hash {
		t.Errorf("expected prev_hash=%s, got %s", ev1.Hash, ev2.PrevHash)
	}
	if err := c.Verify(ev2, ev1.Hash); err != nil {
		t.Errorf("Verify ev2: %v", err)
	}
}

func TestVerifyChainDetectsTamper(t *testing.T) {
	c, err := NewChain([]Key{testKey("k1")})
	if err != nil {
		t.Fatal(err)
	}
	in := BuildInput{
		WorkspaceID: "ws1",
		EventType:   "tool_call.started",
		Payload:     map[string]any{"tool": "lint_deck"},
	}
	var events []Event
	for i := 0; i < 5; i++ {
		ev, err := c.Build(in)
		if err != nil {
			t.Fatal(err)
		}
		c.Commit(ev)
		events = append(events, ev)
	}

	if err := c.VerifyChain(events); err != nil {
		t.Fatalf("VerifyChain (untampered): %v", err)
	}

	// Mutate one event mid-chain.
	events[2].Payload["tool"] = "evil_tool"

	err = c.VerifyChain(events)
	if err == nil {
		t.Fatal("expected VerifyChain to fail after tamper")
	}
	var hashErr *ErrHashMismatch
	if !errors.As(err, &hashErr) {
		t.Errorf("expected ErrHashMismatch, got %T: %v", err, err)
	}
}

func TestVerifyChainDetectsReorder(t *testing.T) {
	c, err := NewChain([]Key{testKey("k1")})
	if err != nil {
		t.Fatal(err)
	}
	in := BuildInput{
		WorkspaceID: "ws1",
		EventType:   "tool_call.started",
		Payload:     map[string]any{"tool": "lint_deck"},
	}
	var events []Event
	for i := 0; i < 3; i++ {
		ev, err := c.Build(in)
		if err != nil {
			t.Fatal(err)
		}
		c.Commit(ev)
		events = append(events, ev)
	}
	// Swap events 1 and 2.
	events[1], events[2] = events[2], events[1]
	err = c.VerifyChain(events)
	if err == nil {
		t.Fatal("expected VerifyChain to fail after reorder")
	}
	var chainErr *ErrChainMismatch
	if !errors.As(err, &chainErr) {
		t.Errorf("expected ErrChainMismatch, got %T: %v", err, err)
	}
}

func TestActiveKeyPrefersRecent(t *testing.T) {
	now := time.Now()
	keys := []Key{
		{
			Kid:          "old",
			KeyHex:       strings.Repeat("aa", 32),
			RotatedAt:    now.Add(-30 * 24 * time.Hour),
			ExpiresAt:    now.Add(60 * 24 * time.Hour),
			OverlapUntil: now.Add(-1 * time.Hour), // past overlap window
		},
		{
			Kid:          "new",
			KeyHex:       strings.Repeat("bb", 32),
			RotatedAt:    now,
			ExpiresAt:    now.Add(90 * 24 * time.Hour),
			OverlapUntil: now.Add(7 * 24 * time.Hour),
		},
	}
	c, err := NewChain(keys)
	if err != nil {
		t.Fatal(err)
	}
	got, err := c.ActiveKey()
	if err != nil {
		t.Fatal(err)
	}
	if got.Kid != "new" {
		t.Errorf("expected new key, got %s", got.Kid)
	}
}

func TestActiveKeyFailsWhenAllExpired(t *testing.T) {
	past := time.Now().Add(-2 * 24 * time.Hour)
	keys := []Key{{
		Kid:          "expired",
		KeyHex:       strings.Repeat("aa", 32),
		RotatedAt:    past,
		ExpiresAt:    past.Add(1 * time.Hour),
		OverlapUntil: past.Add(1 * time.Hour),
	}}
	c, err := NewChain(keys)
	if err != nil {
		t.Fatal(err)
	}
	_, err = c.ActiveKey()
	if !errors.Is(err, ErrNoActiveKey) {
		t.Errorf("expected ErrNoActiveKey, got %v", err)
	}
}

func TestRotateKeyAddsNewKey(t *testing.T) {
	c, err := NewChain([]Key{testKey("k1")})
	if err != nil {
		t.Fatal(err)
	}
	k, err := c.RotateKey("k2")
	if err != nil {
		t.Fatal(err)
	}
	if k.Kid != "k2" {
		t.Errorf("expected kid=k2, got %s", k.Kid)
	}
	if _, ok := c.keys["k2"]; !ok {
		t.Error("k2 not in keys after rotation")
	}
}

func TestConcurrentBuildProducesMonotonicSeq(t *testing.T) {
	c, err := NewChain([]Key{testKey("k1")})
	if err != nil {
		t.Fatal(err)
	}
	const goroutines = 10
	const eventsPerGoroutine = 50

	var wg sync.WaitGroup
	wg.Add(goroutines)
	for g := 0; g < goroutines; g++ {
		go func() {
			defer wg.Done()
			for i := 0; i < eventsPerGoroutine; i++ {
				ev, err := c.Build(BuildInput{
					WorkspaceID: "ws1",
					EventType:   "tool_call.started",
					Payload:     map[string]any{"tool": "lint_deck"},
				})
				if err != nil {
					t.Errorf("Build: %v", err)
					return
				}
				c.Commit(ev)
			}
		}()
	}
	wg.Wait()

	got := c.Snapshot().LastSeqByChain["ws1/"]
	want := int64(goroutines * eventsPerGoroutine)
	if got != want {
		t.Errorf("expected seq=%d, got %d", want, got)
	}
}

func TestHydateThenBuildChainsOffHydratedState(t *testing.T) {
	c1, _ := NewChain([]Key{testKey("k1")})
	in := BuildInput{
		WorkspaceID: "ws1",
		EventType:   "tool_call.started",
		Payload:     map[string]any{"tool": "lint_deck"},
	}
	var events []Event
	for i := 0; i < 3; i++ {
		ev, err := c1.Build(in)
		if err != nil {
			t.Fatal(err)
		}
		c1.Commit(ev)
		events = append(events, ev)
	}

	// "Restart" — new chain with the same key, hydrated state.
	c2, _ := NewChain([]Key{testKey("k1")})
	c2.Hydate(c1.Snapshot())

	ev, err := c2.Build(in)
	if err != nil {
		t.Fatal(err)
	}
	if ev.Seq != 4 {
		t.Errorf("expected seq=4 after restart, got %d", ev.Seq)
	}
	if ev.PrevHash != events[len(events)-1].Hash {
		t.Errorf("expected prev_hash to match last hydrated hash, got %s", ev.PrevHash)
	}
}

func TestComputeEventHashIsDeterministic(t *testing.T) {
	payload := map[string]any{
		"tool": "lint_deck",
		"deck": "deck-123",
		"n":    int64(42),
	}
	h1, err := computeEventHash(strings.Repeat("ab", 32), payload, 1, GenesisHash)
	if err != nil {
		t.Fatal(err)
	}
	h2, err := computeEventHash(strings.Repeat("ab", 32), payload, 1, GenesisHash)
	if err != nil {
		t.Fatal(err)
	}
	if h1 != h2 {
		t.Errorf("expected deterministic hash, got %s vs %s", h1, h2)
	}
}

func TestComputeEventHashDifferentKey(t *testing.T) {
	payload := map[string]any{"tool": "lint_deck"}
	h1, _ := computeEventHash(strings.Repeat("ab", 32), payload, 1, GenesisHash)
	h2, _ := computeEventHash(strings.Repeat("cd", 32), payload, 1, GenesisHash)
	if h1 == h2 {
		t.Error("different keys should produce different hashes")
	}
}

func TestCanonicalizePayloadSortsKeys(t *testing.T) {
	payload := map[string]any{
		"z": "1",
		"a": "2",
		"m": "3",
	}
	c1, _ := canonicalizePayload(payload)
	c2, _ := canonicalizePayload(map[string]any{
		"a": "2",
		"m": "3",
		"z": "1",
	})
	if c1 != c2 {
		t.Errorf("expected identical canonicalization regardless of key order\n  c1=%s\n  c2=%s", c1, c2)
	}
}