package ratelimit

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestBucketInitialCapacity(t *testing.T) {
	b := New(5, 5)
	require.Equal(t, 5.0, b.Tokens())
}

func TestBucketBlocksThenRefills(t *testing.T) {
	// capacity 2, refill 2/s. Drain both tokens, third Wait must sleep.
	b := New(2, 2)
	require.NoError(t, b.Wait(context.Background()))
	require.NoError(t, b.Wait(context.Background()))
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Millisecond)
	defer cancel()
	// Third request — tokens depleted, refill is 500ms/token so a 10ms
	// timeout will not be enough.
	err := b.Wait(ctx)
	require.ErrorIs(t, err, ErrContextCanceled)
}

func TestBucketRefillsAfterDelay(t *testing.T) {
	b := New(1, 10) // 10 tokens/sec → 100ms to refill 1
	require.NoError(t, b.Wait(context.Background()))
	// Sleep enough for one token.
	time.Sleep(150 * time.Millisecond)
	require.NoError(t, b.Wait(context.Background()))
}

func TestBucketDefaults(t *testing.T) {
	b := New(0, 0)
	// Defaults to capacity=1, refill=1/s.
	require.Equal(t, 1.0, b.Capacity())
	require.Equal(t, 1.0, b.RefillRate())
}

func TestBucketSetNow(t *testing.T) {
	// Inject a fake clock to test refill deterministically.
	b := New(2, 1)
	now := time.Unix(1_700_000_000, 0)
	b.SetNow(func() time.Time { return now })
	// Advance by 1s so both initial tokens are available (refill rate 1/s
	// — without the advance, the second Wait would hang waiting for 1s).
	now = now.Add(time.Second)
	require.NoError(t, b.Wait(context.Background()))
	require.NoError(t, b.Wait(context.Background()))
	// Now tokens=0, no time has passed — sleep = 1s. Confirm that
	// advancing the clock to 5s later gives back 2 (capped) tokens.
	now = now.Add(5 * time.Second)
	require.Equal(t, 2.0, b.Tokens())
}
