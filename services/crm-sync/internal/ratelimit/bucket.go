// Package ratelimit implements an in-process token bucket used by
// every CRM adapter. Each adapter instance owns a bucket sized by
// the connection's rate_limit_per_sec, but the HubSpot adapter
// overrides it to the well-known 100 req / 10s marketing tier.
//
// The bucket is intentionally simple: no background refill goroutine,
// no global lock. Callers Wait() before each Push so the bucket is
// always ready for the next request.
package ratelimit

import (
	"context"
	"errors"
	"sync"
	"time"
)

// Bucket is a thread-safe token bucket.
type Bucket struct {
	mu         sync.Mutex
	capacity   float64    // max tokens
	refillRate float64    // tokens per second
	tokens     float64    // current tokens
	lastRefill time.Time  // wall-clock of last refill
	now        func() time.Time // injectable for tests
}

// New returns a bucket with `capacity` tokens that refills at
// `refillPerSec` tokens per second. If capacity is 0 it defaults to
// 1 (so a single request can fire before any refill).
func New(capacity, refillPerSec float64) *Bucket {
	if capacity <= 0 {
		capacity = 1
	}
	if refillPerSec <= 0 {
		refillPerSec = 1
	}
	return &Bucket{
		capacity:   capacity,
		refillRate: refillPerSec,
		tokens:     capacity,
		lastRefill: time.Now(),
		now:        time.Now,
	}
}

// ErrContextCanceled is returned by Wait when the context expires
// before a token becomes available.
var ErrContextCanceled = errors.New("ratelimit: context canceled while waiting for token")

// Wait blocks until a token is available or ctx is canceled. It
// returns ErrContextCanceled on cancellation; nil on success.
func (b *Bucket) Wait(ctx context.Context) error {
	for {
		// Compute delay until next token.
		b.mu.Lock()
		now := b.now()
		elapsed := now.Sub(b.lastRefill).Seconds()
		if elapsed < 0 {
			elapsed = 0 // wall clock went backwards (NTP step); don't drain
		}
		b.tokens += elapsed * b.refillRate
		if b.tokens > b.capacity {
			b.tokens = b.capacity
		}
		b.lastRefill = now
		if b.tokens >= 1 {
			b.tokens--
			b.mu.Unlock()
			return nil
		}
		// Not enough tokens — compute sleep.
		deficit := 1 - b.tokens
		sleep := time.Duration(deficit / b.refillRate * float64(time.Second))
		b.mu.Unlock()

		if sleep <= 0 {
			sleep = time.Millisecond
		}
		t := time.NewTimer(sleep)
		select {
		case <-ctx.Done():
			t.Stop()
			return ErrContextCanceled
		case <-t.C:
			// loop and try again
		}
	}
}

// Tokens returns the current token count (for tests + metrics).
func (b *Bucket) Tokens() float64 {
	b.mu.Lock()
	defer b.mu.Unlock()
	now := b.now()
	elapsed := now.Sub(b.lastRefill).Seconds()
	if elapsed < 0 {
		elapsed = 0
	}
	b.tokens += elapsed * b.refillRate
	if b.tokens > b.capacity {
		b.tokens = b.capacity
	}
	b.lastRefill = now
	return b.tokens
}

// Capacity returns the bucket capacity.
func (b *Bucket) Capacity() float64 { return b.capacity }

// RefillRate returns the refill rate (tokens/sec).
func (b *Bucket) RefillRate() float64 { return b.refillRate }

// SetNow overrides the wall-clock for tests.
func (b *Bucket) SetNow(f func() time.Time) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.now = f
}
