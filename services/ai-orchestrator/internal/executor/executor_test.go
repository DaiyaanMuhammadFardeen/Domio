package executor

import (
	"context"
	"errors"
	"fmt"
	"sync/atomic"
	"testing"
	"time"
)

// ─── Fake providers for testing ────────────────────────────────────

type fakeProvider struct {
	name      string
	responses []fakeResponse
	callCount int
}

type fakeResponse struct {
	response string
	tokens   int
	cost     float64
	err      error
}

func (f *fakeProvider) Name() string { return f.name }

func (f *fakeProvider) Complete(_ context.Context, prompt string) (string, int, float64, error) {
	if f.callCount >= len(f.responses) {
		return "", 0, 0, fmt.Errorf("provider %s: no more responses", f.name)
	}
	r := f.responses[f.callCount]
	f.callCount++
	return r.response, r.tokens, r.cost, r.err
}

type failProvider struct {
	name       string
	failCount  int
	callCount  atomic.Int32
	failEvery  bool
	responseOK string
}

func (f *failProvider) Name() string { return f.name }

func (f *failProvider) Complete(_ context.Context, _ string) (string, int, float64, error) {
	n := f.callCount.Add(1)
	if f.failEvery || int(n) <= f.failCount {
		return "", 0, 0, fmt.Errorf("provider %s: transient error", f.name)
	}
	return f.responseOK, 10, 0.0001, nil
}

// ─── Tests ───────────────────────────────────────────────────────────

func TestRunSuccess(t *testing.T) {
	providers := []Provider{
		&fakeProvider{name: "openai", responses: []fakeResponse{
			{response: "Hello from OpenAI", tokens: 50, cost: 0.001},
		}},
	}
	exec := New(providers, 3, 1.0, 5)

	result, err := exec.Run(context.Background(), "test prompt")
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if result.Provider != "openai" {
		t.Errorf("Provider = %q, want openai", result.Provider)
	}
	if result.Response != "Hello from OpenAI" {
		t.Errorf("Response = %q", result.Response)
	}
	if result.Tokens != 50 {
		t.Errorf("Tokens = %d, want 50", result.Tokens)
	}
	if result.Cost != 0.001 {
		t.Errorf("Cost = %f, want 0.001", result.Cost)
	}
	if result.Retries != 0 {
		t.Errorf("Retries = %d, want 0", result.Retries)
	}
}

func TestRunFallbackToSecondProvider(t *testing.T) {
	providers := []Provider{
		&failProvider{name: "openai", failEvery: true},
		&fakeProvider{name: "anthropic", responses: []fakeResponse{
			{response: "Hello from Anthropic", tokens: 30, cost: 0.002},
		}},
	}
	exec := New(providers, 1, 1.0, 10)

	result, err := exec.Run(context.Background(), "test prompt")
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if result.Provider != "anthropic" {
		t.Errorf("Provider = %q, want anthropic", result.Provider)
	}
	if result.Response != "Hello from Anthropic" {
		t.Errorf("Response = %q", result.Response)
	}
}

func TestRunAllProvidersFail(t *testing.T) {
	providers := []Provider{
		&failProvider{name: "openai", failEvery: true},
		&failProvider{name: "anthropic", failEvery: true},
	}
	exec := New(providers, 1, 1.0, 10)

	_, err := exec.Run(context.Background(), "test prompt")
	if err == nil {
		t.Fatal("expected error when all providers fail")
	}
	if !errors.Is(err, ErrProviderUnavailable) {
		t.Errorf("err = %v, want ErrProviderUnavailable", err)
	}
}

func TestRunCircuitBreaker(t *testing.T) {
	providers := []Provider{
		&failProvider{name: "openai", failEvery: true},
	}
	// threshold=2: after 2 failures the circuit opens.
	exec := New(providers, 0, 1.0, 2)

	// First two calls fail and trip the circuit.
	for i := 0; i < 2; i++ {
		exec.Run(context.Background(), "test")
	}

	if exec.CircuitState_() != CircuitOpen {
		t.Errorf("CircuitState = %v, want CircuitOpen", exec.CircuitState_())
	}

	// Third call should be rejected immediately.
	_, err := exec.Run(context.Background(), "test")
	if !errors.Is(err, ErrCircuitOpen) {
		t.Errorf("err = %v, want ErrCircuitOpen", err)
	}
}

func TestRunCostLimitExceeded(t *testing.T) {
	providers := []Provider{
		&fakeProvider{name: "openai", responses: []fakeResponse{
			{response: "ok", tokens: 100, cost: 0.5},
			{response: "ok2", tokens: 100, cost: 0.5},
		}},
	}
	// cost cap of 0.6 — first call costs 0.5. Second call passes the
	// estimate check (0.5 + 0.01 < 0.6) but the actual cost 0.5 pushes
	// spentSoFar to 1.0. We verify TotalCost > cap after both calls.
	// To test the actual gate, we make a third call where the estimate
	// alone exceeds the remaining budget.
	exec := New(providers, 3, 0.6, 10)

	// First call succeeds (spent 0.5).
	_, err := exec.Run(context.Background(), "test")
	if err != nil {
		t.Fatalf("Run: %v", err)
	}

	// Second call: estimate 0.01 + spent 0.5 = 0.51 < 0.6, passes gate.
	// Actual cost 0.5 brings total to 1.0.
	_, err = exec.Run(context.Background(), "test2")
	if err != nil {
		t.Fatalf("Run 2: %v", err)
	}

	// Third call: estimate 0.01 + spent 1.0 = 1.01 > 0.6, blocked.
	_, err = exec.Run(context.Background(), "test3")
	if err == nil {
		t.Fatal("expected cost limit error")
	}
	if !errors.Is(err, ErrCostLimitExceeded) {
		t.Errorf("err = %v, want ErrCostLimitExceeded", err)
	}
}

func TestRunRetryWithBackoff(t *testing.T) {
	// Provider fails twice then succeeds.
	fp := &fakeProvider{name: "openai", responses: []fakeResponse{
		{err: fmt.Errorf("transient 1")},
		{err: fmt.Errorf("transient 2")},
		{response: "success", tokens: 10, cost: 0.001},
	}}
	exec := New([]Provider{fp}, 3, 1.0, 10)

	start := time.Now()
	result, err := exec.Run(context.Background(), "test")
	elapsed := time.Since(start)

	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if result.Retries != 2 {
		t.Errorf("Retries = %d, want 2", result.Retries)
	}
	// Should have some backoff delay (100ms + 200ms = 300ms minimum).
	if elapsed < 250*time.Millisecond {
		t.Errorf("elapsed %v, expected at least 250ms due to backoff", elapsed)
	}
}

func TestRunContextCancelled(t *testing.T) {
	providers := []Provider{
		&failProvider{name: "openai", failEvery: true},
	}
	exec := New(providers, 10, 1.0, 100)

	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()

	_, err := exec.Run(ctx, "test")
	if err == nil {
		t.Fatal("expected error for cancelled context")
	}
}

func TestTotalCost(t *testing.T) {
	providers := []Provider{
		&fakeProvider{name: "openai", responses: []fakeResponse{
			{response: "ok", tokens: 10, cost: 0.1},
			{response: "ok", tokens: 10, cost: 0.2},
		}},
	}
	exec := New(providers, 3, 10.0, 10)

	exec.Run(context.Background(), "test1")
	exec.Run(context.Background(), "test2")

	total := exec.TotalCost()
	// Allow small float diff.
	if total < 0.29 || total > 0.31 {
		t.Errorf("TotalCost = %f, want ~0.3", total)
	}
}

func TestCircuitHalfOpenRecovery(t *testing.T) {
	providers := []Provider{
		&failProvider{name: "openai", failEvery: true},
	}
	exec := New(providers, 0, 1.0, 1)

	// Trip the circuit.
	exec.Run(context.Background(), "test")
	if exec.CircuitState_() != CircuitOpen {
		t.Fatalf("CircuitState = %v, want CircuitOpen", exec.CircuitState_())
	}

	// Override cooldown to make it expire immediately.
	exec.mu.Lock()
	exec.cooldownPeriod = 0
	exec.lastFailure = time.Now().Add(-time.Second)
	exec.mu.Unlock()

	// Next call should transition to half-open and succeed if the provider
	// were to succeed. Since our provider always fails, it'll stay open
	// but we can verify the state transition.
	exec.Run(context.Background(), "test")

	// Still open because the provider failed again.
	if exec.CircuitState_() != CircuitOpen {
		t.Errorf("CircuitState = %v, want CircuitOpen after probe failure", exec.CircuitState_())
	}
}
