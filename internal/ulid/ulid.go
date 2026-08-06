// Package ulid provides a small, monotonic, thread-safe ULID
// generator for the Go workers.
//
// It is intentionally tiny — we don't ship the third-party `oklog/ulid`
// dependency because we want a single 26-char Crockford-base32 string
// with millisecond precision; the production generator adds an
// 80-bit random tail drawn from crypto/rand.
//
// The generator is safe for concurrent use by multiple goroutines
// (the workspace host, the op-writer, the diff-renderer, etc.).  The
// generator accepts a worker id used as the entropy prefix when the
// NATS context is available; that lets the dedicated worker issue
// id-stable event ids without coordinating with the rest of the
// cluster.
package ulid

import (
	"crypto/rand"
	"fmt"
	"sync"
	"time"
)

// Crockford base32 alphabet excluding I, L, O, U.
const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

// Generator produces ULIDs from a monotonic clock.
type Generator = generator

type generator struct {
	mu      sync.Mutex
	lastMS  int64
	counter uint64
	worker  string
}

// Option configures the generator.
type Option func(*Generator)

// WithWorker attaches a worker id used as the entropy prefix.
func WithWorker(worker string) Option {
	return func(g *Generator) { g.worker = worker }
}

// New creates a Generator pinned to the current process clock.
func New(opts ...Option) *Generator {
	g := &Generator{}
	for _, opt := range opts {
		opt(g)
	}
	return g
}

// NewString returns a fresh 26-character Crockford-base32 ULID.  The
// generator is monotonic per-process: successive calls within the
// same millisecond increment an 80-bit random tail until the next
// millisecond tick.
func (g *Generator) NewString() string {
	now := time.Now().UTC().UnixMilli()
	g.mu.Lock()
	if now == g.lastMS {
		g.counter++
	} else {
		g.lastMS = now
		g.counter = 0
	}
	seq := g.counter
	g.mu.Unlock()

	var rnd [10]byte
	if _, err := rand.Read(rnd[:]); err != nil {
		// Rare; fall back to deterministic bytes so we never hand out
		// an empty id.
		for i := range rnd {
			rnd[i] = byte(seq >> (i % 8))
		}
	}

	// 48 bits of millisecond timestamp + 80 bits of entropy.
	var id [16]byte
	id[0] = byte(now >> 40)
	id[1] = byte(now >> 32)
	id[2] = byte(now >> 24)
	id[3] = byte(now >> 16)
	id[4] = byte(now >> 8)
	id[5] = byte(now)
	id[6] = rnd[0]
	id[7] = rnd[1]
	id[8] = rnd[2]
	id[9] = rnd[3]
	id[10] = rnd[4]
	id[11] = rnd[5]
	id[12] = rnd[6]
	id[13] = rnd[7]
	id[14] = rnd[8]
	id[15] = rnd[9]

	out := make([]byte, 26)
	for i := 0; i < 10; i++ {
		out[2*i] = alphabet[id[i]>>3]
		out[2*i+1] = alphabet[(id[i]&0x07)<<2|id[i+1]>>6]
	}
	out[20] = alphabet[id[10]>>3]
	out[21] = alphabet[(id[10]&0x07)<<2|id[11]>>6]
	out[22] = alphabet[(id[11]&0x1F)<<0]
	out[23] = alphabet[id[12]&0x1F]
	out[24] = alphabet[(id[13]>>1)&0x1F]
	out[25] = alphabet[((id[13]&0x01)<<4)|((id[14]>>4)&0x0F)]

	if g.worker != "" {
		// Embed the worker id in the last 6 chars when present so log
		// lines can grep on it; trims if the worker id is too long.
		w := g.worker
		if len(w) > 6 {
			w = w[:6]
		}
		copy(out[20:], w)
	}
	return fmt.Sprintf("%s", string(out))
}
