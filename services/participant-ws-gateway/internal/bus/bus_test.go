package bus_test

import (
	"sync"
	"sync/atomic"
	"testing"

	"github.com/domio/platform/services/participant-ws-gateway/internal/bus"
)

func TestPublish_AssignsMonotonicSeq(t *testing.T) {
	b := bus.New()
	var seqs []uint64
	sub := b.Subscribe("t", "c", 0, func(m bus.Message) error {
		seqs = append(seqs, m.Seq)
		return nil
	})
	defer b.Unsubscribe(sub)
	for i := 0; i < 5; i++ {
		_, _ = b.Publish("t", []byte("x"))
	}
	if len(seqs) != 5 {
		t.Fatalf("expected 5 deliveries, got %d", len(seqs))
	}
	for i := 1; i < len(seqs); i++ {
		if seqs[i] <= seqs[i-1] {
			t.Fatalf("non-monotonic at %d", i)
		}
	}
}

func TestPublish_FansOutToMultipleConsumers(t *testing.T) {
	b := bus.New()
	var a, c int32
	sa := b.Subscribe("t", "a", 0, func(bus.Message) error { atomic.AddInt32(&a, 1); return nil })
	sc := b.Subscribe("t", "c", 0, func(bus.Message) error { atomic.AddInt32(&c, 1); return nil })
	defer b.Unsubscribe(sa)
	defer b.Unsubscribe(sc)
	_, _ = b.Publish("t", []byte("hello"))
	if atomic.LoadInt32(&a) != 1 || atomic.LoadInt32(&c) != 1 {
		t.Fatalf("expected both subscribers to fire once")
	}
}

func TestSubscribe_StartSeqFilters(t *testing.T) {
	b := bus.New()
	for i := 0; i < 3; i++ {
		_, _ = b.Publish("t", []byte("x"))
	}
	var seen []uint64
	sub := b.Subscribe("t", "c", 4, func(m bus.Message) error {
		seen = append(seen, m.Seq)
		return nil
	})
	defer b.Unsubscribe(sub)
	_, _ = b.Publish("t", []byte("x"))
	if len(seen) != 1 || seen[0] != 4 {
		t.Fatalf("expected only seq=4, got %v", seen)
	}
}

func TestUnsubscribe_StopsDelivery(t *testing.T) {
	b := bus.New()
	var n int32
	sub := b.Subscribe("t", "c", 0, func(bus.Message) error { atomic.AddInt32(&n, 1); return nil })
	_, _ = b.Publish("t", []byte("x"))
	b.Unsubscribe(sub)
	_, _ = b.Publish("t", []byte("x"))
	if atomic.LoadInt32(&n) != 1 {
		t.Fatalf("expected 1, got %d", n)
	}
}

func TestBus_ConcurrentSafe(t *testing.T) {
	b := bus.New()
	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 100; j++ {
				_, _ = b.Publish("t", []byte("x"))
			}
		}()
	}
	wg.Wait()
}

func TestBus_CloseRemovesAllSubs(t *testing.T) {
	b := bus.New()
	_ = b.Subscribe("t", "c", 0, func(bus.Message) error { return nil })
	b.Close()
	if b.SubCount("t") != 0 {
		t.Fatalf("expected 0 after close")
	}
}