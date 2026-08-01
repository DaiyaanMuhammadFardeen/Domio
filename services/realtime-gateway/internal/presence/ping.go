package presence

import (
	"sync"
	"time"
)

const (
	// PingRateLimit is the minimum interval between pings from the same user.
	PingRateLimit = 2 * time.Second
)

// PingRateLimiter enforces per-user ping rate limiting.
type PingRateLimiter struct {
	mu      sync.Mutex
	buckets map[string]time.Time
}

// NewPingRateLimiter creates a new ping rate limiter.
func NewPingRateLimiter() *PingRateLimiter {
	return &PingRateLimiter{
		buckets: make(map[string]time.Time),
	}
}

// Allow checks whether an actor may send a ping now.
func (r *PingRateLimiter) Allow(actorID string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()

	now := time.Now()
	last, exists := r.buckets[actorID]
	if exists && now.Sub(last) < PingRateLimit {
		return false
	}
	r.buckets[actorID] = now
	return true
}

// Cleanup removes expired entries.
func (r *PingRateLimiter) Cleanup() {
	r.mu.Lock()
	defer r.mu.Unlock()

	now := time.Now()
	for k, v := range r.buckets {
		if now.Sub(v) > PingRateLimit*10 {
			delete(r.buckets, k)
		}
	}
}
