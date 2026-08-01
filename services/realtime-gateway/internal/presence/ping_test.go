package presence

import (
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestPingRateLimiter_Allow(t *testing.T) {
	limiter := NewPingRateLimiter()

	// First ping should be allowed.
	assert.True(t, limiter.Allow("user-1"))

	// Second immediate ping should be rejected.
	assert.False(t, limiter.Allow("user-1"))

	// Different user should be allowed.
	assert.True(t, limiter.Allow("user-2"))
}

func TestPingRateLimiter_WindowPass(t *testing.T) {
	limiter := NewPingRateLimiter()

	// Allow the first ping.
	assert.True(t, limiter.Allow("user-1"))

	// Wait for the rate limit window to pass.
	time.Sleep(PingRateLimit + 10*time.Millisecond)

	// Now should be allowed again.
	assert.True(t, limiter.Allow("user-1"))
}

func TestPingRateLimiter_ThreeInWindow(t *testing.T) {
	limiter := NewPingRateLimiter()

	// First: allowed.
	assert.True(t, limiter.Allow("user-1"))
	// Second: rejected (within window).
	assert.False(t, limiter.Allow("user-1"))
	// Third: rejected (still within window).
	assert.False(t, limiter.Allow("user-1"))

	// Wait for window.
	time.Sleep(PingRateLimit + 10*time.Millisecond)

	// Now accepted.
	assert.True(t, limiter.Allow("user-1"))
}

func TestPingRateLimiter_Concurrent(t *testing.T) {
	limiter := NewPingRateLimiter()

	var wg sync.WaitGroup
	allowed := make(chan bool, 100)

	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			allowed <- limiter.Allow("concurrent-user")
		}()
	}

	wg.Wait()
	close(allowed)

	// Exactly one should have been allowed.
	count := 0
	for a := range allowed {
		if a {
			count++
		}
	}
	assert.Equal(t, 1, count, "exactly one concurrent ping should be allowed")
}
