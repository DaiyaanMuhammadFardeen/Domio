package presence

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestChatRateLimiter_Allow(t *testing.T) {
	limiter := NewChatRateLimiter()

	// First message allowed.
	assert.True(t, limiter.Allow("user-1"))

	// Immediate second rejected.
	assert.False(t, limiter.Allow("user-1"))

	// Different user allowed.
	assert.True(t, limiter.Allow("user-2"))
}

func TestChatRateLimiter_WindowPass(t *testing.T) {
	limiter := NewChatRateLimiter()

	assert.True(t, limiter.Allow("user-1"))

	// Simulate time passing by directly manipulating the bucket.
	limiter.mu.Lock()
	limiter.buckets["user-1"] = time.Now().Add(-ChatRateLimit - time.Second)
	limiter.mu.Unlock()

	assert.True(t, limiter.Allow("user-1"))
}

func TestValidatePayload(t *testing.T) {
	tests := []struct {
		name    string
		payload []byte
		want    bool
	}{
		{
			name:    "empty payload",
			payload: []byte{},
			want:    true,
		},
		{
			name:    "small payload",
			payload: []byte("hello"),
			want:    true,
		},
		{
			name:    "exact max",
			payload: make([]byte, ChatMaxPayloadSize),
			want:    true,
		},
		{
			name:    "over max",
			payload: make([]byte, ChatMaxPayloadSize+1),
			want:    false,
		},
		{
			name:    "way over max",
			payload: make([]byte, 10240),
			want:    false,
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, ValidatePayload(tc.payload))
		})
	}
}
