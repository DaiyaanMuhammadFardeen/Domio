package sync

import (
	"context"
	"errors"
	"fmt"
	"math/rand"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/domio/platform/services/crm-sync/internal/dlq"
	"github.com/domio/platform/services/crm-sync/internal/registry"
)

type fakeAdapter struct {
	calls int32
	errs  []error
}

func (f *fakeAdapter) Name() string { return "fake" }
func (f *fakeAdapter) Push(_ context.Context, _ registry.Connection, _ registry.Record) error {
	n := atomic.AddInt32(&f.calls, 1)
	idx := int(n) - 1
	if idx < len(f.errs) {
		return f.errs[idx]
	}
	return nil
}
func (f *fakeAdapter) Pull(_ context.Context, _ registry.Connection, _ int64) ([]registry.Record, error) {
	return nil, nil
}

func TestRetryPolicySucceedsFirstTry(t *testing.T) {
	a := &fakeAdapter{}
	pub := &dlq.InMemoryPublisher{}
	policy := RetryPolicy{MaxAttempts: 5, InitialBackoff: time.Millisecond, MaxBackoff: 10 * time.Millisecond, JitterFraction: 0}
	err := policy.Run(context.Background(), registry.Connection{}, registry.Record{}, a, pub)
	require.NoError(t, err)
	require.Equal(t, int32(1), atomic.LoadInt32(&a.calls))
	require.Empty(t, pub.Messages)
}

func TestRetryPolicyExhausts(t *testing.T) {
	a := &fakeAdapter{errs: []error{
		fmt.Errorf("rate limited"),
		fmt.Errorf("rate limited"),
		fmt.Errorf("rate limited"),
		fmt.Errorf("rate limited"),
		fmt.Errorf("rate limited"),
	}}
	pub := &dlq.InMemoryPublisher{}
	policy := RetryPolicy{MaxAttempts: 5, InitialBackoff: time.Millisecond, MaxBackoff: 5 * time.Millisecond, JitterFraction: 0}
	err := policy.Run(context.Background(),
		registry.Connection{ConnectionID: "c-1"},
		registry.Record{WorkspaceID: "w", ConnectionID: "c-1", ViewerIDKey: "v", EventID: "e", EventName: "view"},
		a, pub)
	require.Error(t, err)
	var ex *ExhaustedError
	require.ErrorAs(t, err, &ex)
	require.Equal(t, 5, ex.Attempts)
	require.Equal(t, int32(5), atomic.LoadInt32(&a.calls))
	require.Len(t, pub.Messages, 1)
	require.Equal(t, "c-1", pub.Messages[0].ConnectionID)
	require.NotEmpty(t, pub.Messages[0].IdempotencyKey)
}

func TestRetryPolicyRecoversAfterRetryable(t *testing.T) {
	a := &fakeAdapter{errs: []error{
		&registry.ErrRateLimited{RetryAfterMs: 1},
		&registry.ErrRateLimited{RetryAfterMs: 1},
		nil,
	}}
	pub := &dlq.InMemoryPublisher{}
	policy := RetryPolicy{MaxAttempts: 5, InitialBackoff: time.Millisecond, MaxBackoff: 10 * time.Millisecond, JitterFraction: 0}
	err := policy.Run(context.Background(),
		registry.Connection{},
		registry.Record{WorkspaceID: "w", ViewerIDKey: "v", EventID: "e", EventName: "view"},
		a, pub)
	require.NoError(t, err)
	require.Equal(t, int32(3), atomic.LoadInt32(&a.calls))
	require.Empty(t, pub.Messages)
}

func TestRetryPolicyPermanentErrorNoRetry(t *testing.T) {
	a := &fakeAdapter{errs: []error{&PermanentError{Cause: errors.New("bad data")}}}
	pub := &dlq.InMemoryPublisher{}
	policy := RetryPolicy{MaxAttempts: 5, InitialBackoff: time.Millisecond, MaxBackoff: 10 * time.Millisecond, JitterFraction: 0}
	err := policy.Run(context.Background(), registry.Connection{}, registry.Record{}, a, pub)
	require.Error(t, err)
	require.Contains(t, err.Error(), "permanent")
	require.Equal(t, int32(1), atomic.LoadInt32(&a.calls))
	require.Empty(t, pub.Messages)
}

func TestBackoffShape(t *testing.T) {
	p := RetryPolicy{MaxAttempts: 10, InitialBackoff: 100 * time.Millisecond, MaxBackoff: 5 * time.Second, JitterFraction: 0}
	require.Equal(t, time.Duration(0), p.backoff(1, nil))
	require.Equal(t, 100*time.Millisecond, p.backoff(2, nil))
	require.Equal(t, 200*time.Millisecond, p.backoff(3, nil))
	require.Equal(t, 400*time.Millisecond, p.backoff(4, nil))
	// Capped at MaxBackoff
	require.Equal(t, 5*time.Second, p.backoff(20, nil))
}

func TestBackoffJitter(t *testing.T) {
	p := RetryPolicy{MaxAttempts: 5, InitialBackoff: time.Second, MaxBackoff: 30 * time.Second, JitterFraction: 0.5}
	rng := rand.New(rand.NewSource(1))
	// 10 samples all within ±50% of 2s (attempt 3 → base 2s).
	for i := 0; i < 10; i++ {
		d := p.backoff(3, rng)
		require.GreaterOrEqual(t, d, time.Duration(float64(time.Second)))
		require.LessOrEqual(t, d, 3*time.Second)
	}
}

func TestExhaustedErrorMessage(t *testing.T) {
	e := &ExhaustedError{Attempts: 5, Cause: errors.New("boom")}
	require.Contains(t, e.Error(), "5")
	require.Contains(t, e.Error(), "boom")
	require.Equal(t, errors.Unwrap(e).Error(), "boom")
}

// ctxCancelAdapter always returns a long rate-limit error so the
// retry loop blocks in the wait, exposing ctx cancellation.
type ctxCancelAdapter struct {
	calls int32
}

func (c *ctxCancelAdapter) Name() string { return "ctx-cancel" }
func (c *ctxCancelAdapter) Push(_ context.Context, _ registry.Connection, _ registry.Record) error {
	atomic.AddInt32(&c.calls, 1)
	return &registry.ErrRateLimited{RetryAfterMs: 60_000}
}
func (c *ctxCancelAdapter) Pull(_ context.Context, _ registry.Connection, _ int64) ([]registry.Record, error) {
	return nil, nil
}

func TestContextCancelStopsRetry(t *testing.T) {
	a := &ctxCancelAdapter{}
	pub := &dlq.InMemoryPublisher{}
	policy := RetryPolicy{MaxAttempts: 5, InitialBackoff: time.Millisecond, MaxBackoff: 60 * time.Second, JitterFraction: 0}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Millisecond)
	defer cancel()
	err := policy.Run(ctx, registry.Connection{}, registry.Record{WorkspaceID: "w", ViewerIDKey: "v", EventID: "e", EventName: "view"}, a, pub)
	require.Error(t, err)
	require.Less(t, atomic.LoadInt32(&a.calls), int32(5), "should have cancelled before exhausting")
}
