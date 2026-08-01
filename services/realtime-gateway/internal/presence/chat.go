package presence

import (
	"sync"
	"time"
)

const (
	// ChatRateLimit is the minimum interval between messages from the same user.
	ChatRateLimit = 2 * time.Second

	// ChatMaxPayloadSize is the maximum size of a chat message payload (4 KiB).
	ChatMaxPayloadSize = 4096
)

// ChatRateLimiter enforces per-user chat rate limiting using a token bucket
// stored in memory.
type ChatRateLimiter struct {
	mu      sync.Mutex
	buckets map[string]time.Time // actorID → last message time
}

// NewChatRateLimiter creates a new rate limiter.
func NewChatRateLimiter() *ChatRateLimiter {
	return &ChatRateLimiter{
		buckets: make(map[string]time.Time),
	}
}

// Allow checks whether an actor may send a chat message now.
// Returns true if the rate limit has been respected.
func (r *ChatRateLimiter) Allow(actorID string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()

	now := time.Now()
	last, exists := r.buckets[actorID]
	if exists && now.Sub(last) < ChatRateLimit {
		return false
	}
	r.buckets[actorID] = now
	return true
}

// ValidatePayload checks that a chat payload is within the size limit.
func ValidatePayload(payload []byte) bool {
	return len(payload) <= ChatMaxPayloadSize
}

// Cleanup removes expired entries. Should be called periodically.
func (r *ChatRateLimiter) Cleanup() {
	r.mu.Lock()
	defer r.mu.Unlock()

	now := time.Now()
	for k, v := range r.buckets {
		if now.Sub(v) > ChatRateLimit*10 {
			delete(r.buckets, k)
		}
	}
}
