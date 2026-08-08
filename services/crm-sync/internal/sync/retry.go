// Package sync contains the crm-sync orchestrator. The orchestrator
// reads CRM sync events from NATS, applies the per-(workspace,
// connection) field map, calls the right adapter, retries on
// transient failures with exponential backoff + jitter, and pushes
// poison events to the DLQ after MaxAttempts.
package sync

import (
	"context"
	"errors"
	"fmt"
	"math"
	"math/rand"
	"time"

	"github.com/domio/platform/services/crm-sync/internal/dlq"
	"github.com/domio/platform/services/crm-sync/internal/idempotency"
	"github.com/domio/platform/services/crm-sync/internal/registry"
)

// RetryPolicy controls the exponential-backoff loop. MaxAttempts is
// inclusive of the first try (so MaxAttempts=5 means 1 initial try
// + 4 retries).
type RetryPolicy struct {
	MaxAttempts     int
	InitialBackoff  time.Duration
	MaxBackoff      time.Duration
	JitterFraction  float64 // 0.0 = none, 0.5 = ±50%
}

// DefaultRetryPolicy is the policy the orchestrator boots with.
var DefaultRetryPolicy = RetryPolicy{
	MaxAttempts:    5,
	InitialBackoff: 200 * time.Millisecond,
	MaxBackoff:     30 * time.Second,
	JitterFraction: 0.3,
}

// backoff returns the sleep duration before attempt n (n >= 1).
// attempt 1 → 0 (no sleep before the first try)
// attempt 2 → InitialBackoff ± jitter
// attempt n → min(MaxBackoff, InitialBackoff * 2^(n-2))
func (p RetryPolicy) backoff(attempt int, rng *rand.Rand) time.Duration {
	if attempt <= 1 {
		return 0
	}
	base := float64(p.InitialBackoff) * math.Pow(2, float64(attempt-2))
	if base > float64(p.MaxBackoff) {
		base = float64(p.MaxBackoff)
	}
	if p.JitterFraction > 0 && rng != nil {
		// Symmetric jitter in [-JitterFraction*base, +JitterFraction*base].
		j := (rng.Float64()*2 - 1) * p.JitterFraction * base
		base += j
		if base < 0 {
			base = 0
		}
	}
	return time.Duration(base)
}

// Run executes the push with retries. It returns nil on success, an
// ExhaustedError after the last attempt fails with a retryable
// error (after publishing to DLQ), or an error wrapping the
// lastErr directly when the error is permanent (e.g. a 4xx that
// isn't 429).
func (p RetryPolicy) Run(
	ctx context.Context,
	conn registry.Connection,
	rec registry.Record,
	adapter registry.Adapter,
	dlqPub dlq.Publisher,
) error {
	rng := rand.New(rand.NewSource(time.Now().UnixNano()))
	var lastErr error
	for attempt := 1; attempt <= p.MaxAttempts; attempt++ {
		if d := p.backoff(attempt, rng); d > 0 {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(d):
			}
		}
		err := adapter.Push(ctx, conn, rec)
		if err == nil {
			return nil
		}
		lastErr = err
		var rl *registry.ErrRateLimited
		if errors.As(err, &rl) {
			// 429s are retryable but the provider told us how long
			// to wait. Honor it (clamped to MaxBackoff) instead of
			// the computed backoff.
			wait := time.Duration(rl.RetryAfterMs) * time.Millisecond
			if wait > p.MaxBackoff {
				wait = p.MaxBackoff
			}
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(wait):
				continue
			}
		}
		// Non-429 errors are retryable; adapters signal a permanent
		// problem by wrapping with PermanentError. A plain error
		// (e.g. transient network blip, 5xx) is retried.
		var perm *PermanentError
		if errors.As(err, &perm) {
			return fmt.Errorf("permanent error: %w", err)
		}
	}
	// Exhausted retries — push to DLQ.
	key, _ := idempotency.Key(rec.WorkspaceID, rec.ViewerIDKey, rec.EventName, rec.EventID)
	_ = dlqPub.Publish(ctx, dlq.Message{
		WorkspaceID:    rec.WorkspaceID,
		ConnectionID:   rec.ConnectionID,
		ViewerIDKey:    rec.ViewerIDKey,
		EventID:        rec.EventID,
		EventName:      rec.EventName,
		IdempotencyKey: key,
		Attempts:       p.MaxAttempts,
		LastError:      lastErrString(lastErr),
		FailedAtMs:     time.Now().UnixMilli(),
	})
	return &ExhaustedError{Attempts: p.MaxAttempts, Cause: lastErr}
}

// PermanentError marks an adapter Push result as not retryable
// (e.g. 400/404). The retry policy wraps it in a plain error.
type PermanentError struct {
	Cause error
}

func (e *PermanentError) Error() string { return e.Cause.Error() }
func (e *PermanentError) Unwrap() error { return e.Cause }

// ExhaustedError is returned when MaxAttempts is reached without
// success.
type ExhaustedError struct {
	Attempts int
	Cause    error
}

func (e *ExhaustedError) Error() string {
	return fmt.Sprintf("crm-sync: exhausted %d attempts: %v", e.Attempts, e.Cause)
}

func (e *ExhaustedError) Unwrap() error { return e.Cause }

// lastErrString returns the error message for the DLQ envelope.
func lastErrString(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}
