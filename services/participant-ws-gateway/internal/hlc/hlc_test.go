package hlc_test

import (
	"sync"
	"testing"
	"time"

	"github.com/domio/platform/services/participant-ws-gateway/internal/hlc"
)

func TestClock_AdvancingTimeIncreasesPack(t *testing.T) {
	base := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	c := hlc.New(func() time.Time { return base })

	a := c.Now()
	base = base.Add(5 * time.Millisecond)
	b := c.Now()
	if a >= b {
		t.Fatalf("expected b > a; got a=%d b=%d", a, b)
	}
}

func TestClock_ConcurrentCallsAreOrdered(t *testing.T) {
	c := hlc.New(nil)
	var wg sync.WaitGroup
	out := make([]hlc.Pack, 100)
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			out[i] = c.Now()
		}(i)
	}
	wg.Wait()
	seen := map[hlc.Pack]bool{}
	for _, p := range out {
		if seen[p] {
			t.Fatalf("duplicate pack: %d", p)
		}
		seen[p] = true
	}
}

func TestClock_LogicalCounterResetsOnNewPhysical(t *testing.T) {
	base := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	c := hlc.New(func() time.Time { return base })
	a := c.Now()
	base = base.Add(time.Second)
	b := c.Now()
	if b.Physical() <= a.Physical() {
		t.Fatalf("physical must advance; a=%d b=%d", a.Physical(), b.Physical())
	}
	if b.Logical() != 0 {
		t.Fatalf("logical should reset on physical advance; got %d", b.Logical())
	}
}

func TestPack_Compare(t *testing.T) {
	a := hlc.Pack(100)
	b := hlc.Pack(200)
	if a.Compare(b) != -1 {
		t.Fatalf("expected a < b")
	}
	if b.Compare(a) != 1 {
		t.Fatalf("expected b > a")
	}
	if a.Compare(a) != 0 {
		t.Fatalf("expected a == a")
	}
}

func TestPack_Decompose(t *testing.T) {
	p := hlc.Pack(0x00001234567890ab)
	want := int64(0x12345678)
	if p.Physical() != want {
		t.Fatalf("physical mismatch: got %d want %d", p.Physical(), want)
	}
	if p.Logical() != 0x90ab {
		t.Fatalf("logical mismatch: got %d want 0x90ab", p.Logical())
	}
}