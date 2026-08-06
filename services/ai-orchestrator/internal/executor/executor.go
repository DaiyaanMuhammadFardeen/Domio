// Package executor runs AI provider calls with retry, fallback, and cost
// tracking. It provides an interface so tests can inject fakes.
package executor

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"
)

var (
	// ErrCircuitOpen is returned when the circuit breaker is open.
	ErrCircuitOpen = errors.New("executor: circuit breaker open")
	// ErrCostLimitExceeded is returned when the request would exceed the cost cap.
	ErrCostLimitExceeded = errors.New("executor: cost limit exceeded")
	// ErrProviderUnavailable is returned when all providers have failed.
	ErrProviderUnavailable = errors.New("executor: all providers unavailable")
)

// CircuitState tracks the circuit breaker state.
type CircuitState int

const (
	CircuitClosed   CircuitState = iota // normal operation
	CircuitOpen                         // failing, reject requests
	CircuitHalfOpen                     // testing recovery
)

// Provider is the interface that AI backends must implement.
type Provider interface {
	// Name returns the provider identifier (e.g. "openai").
	Name() string
	// Complete sends a prompt and returns the response text and token cost.
	Complete(ctx context.Context, prompt string) (response string, tokens int, cost float64, err error)
}

// ExecutionResult is the output of a successful execution.
type ExecutionResult struct {
	Provider   string  `json:"provider"`
	Response   string  `json:"response"`
	Tokens     int     `json:"tokens"`
	Cost       float64 `json:"cost"`
	Retries    int     `json:"retries"`
	DurationMs int64   `json:"duration_ms"`
}

// Executor coordinates calls to AI providers with retry and fallback.
type Executor struct {
	mu             sync.RWMutex
	providers      []Provider
	fallbackOrder  []string
	maxRetries     int
	totalCostCap   float64
	spentSoFar     float64
	circuitState   CircuitState
	failures       int
	threshold      int
	lastFailure    time.Time
	cooldownPeriod time.Duration
}

// New creates an Executor with the given configuration.
func New(providers []Provider, maxRetries int, totalCostCap float64, circuitThreshold int) *Executor {
	names := make([]string, len(providers))
	for i, p := range providers {
		names[i] = p.Name()
	}
	return &Executor{
		providers:      providers,
		fallbackOrder:  names,
		maxRetries:     maxRetries,
		totalCostCap:   totalCostCap,
		circuitState:   CircuitClosed,
		threshold:      circuitThreshold,
		cooldownPeriod: 30 * time.Second,
	}
}

// Run executes a prompt through the provider chain with retry and fallback.
func (e *Executor) Run(ctx context.Context, prompt string) (*ExecutionResult, error) {
	if err := e.checkCircuit(); err != nil {
		return nil, err
	}
	if err := e.checkCost(0.01); err != nil { // estimate minimum cost
		return nil, err
	}

	start := time.Now()
	var lastErr error

	for _, provider := range e.providers {
		for attempt := 0; attempt <= e.maxRetries; attempt++ {
			if ctx.Err() != nil {
				return nil, ctx.Err()
			}

			response, tokens, cost, err := provider.Complete(ctx, prompt)
			if err != nil {
				lastErr = err
				e.recordFailure()
				// Exponential backoff before retry.
				backoff := time.Duration(1<<uint(attempt)) * 100 * time.Millisecond
				select {
				case <-time.After(backoff):
				case <-ctx.Done():
					return nil, ctx.Err()
				}
				continue
			}

			// Success.
			e.recordSuccess()
			e.addCost(cost)

			return &ExecutionResult{
				Provider:   provider.Name(),
				Response:   response,
				Tokens:     tokens,
				Cost:       cost,
				Retries:    attempt,
				DurationMs: time.Since(start).Milliseconds(),
			}, nil
		}
		// All retries for this provider exhausted — try next provider.
	}

	return nil, fmt.Errorf("%w: %v", ErrProviderUnavailable, lastErr)
}

// CircuitState_ returns the current circuit breaker state.
func (e *Executor) CircuitState_() CircuitState {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return e.circuitState
}

// TotalCost returns the cumulative cost of all executions.
func (e *Executor) TotalCost() float64 {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return e.spentSoFar
}

func (e *Executor) checkCircuit() error {
	e.mu.Lock()
	defer e.mu.Unlock()

	switch e.circuitState {
	case CircuitOpen:
		if time.Since(e.lastFailure) > e.cooldownPeriod {
			e.circuitState = CircuitHalfOpen
			return nil
		}
		return ErrCircuitOpen
	case CircuitHalfOpen:
		// Allow one probe request through.
		return nil
	default:
		return nil
	}
}

func (e *Executor) checkCost(estimated float64) error {
	e.mu.RLock()
	defer e.mu.RUnlock()
	if e.spentSoFar+estimated > e.totalCostCap {
		return ErrCostLimitExceeded
	}
	return nil
}

func (e *Executor) recordFailure() {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.failures++
	e.lastFailure = time.Now()
	if e.failures >= e.threshold {
		e.circuitState = CircuitOpen
	}
}

func (e *Executor) recordSuccess() {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.failures = 0
	if e.circuitState == CircuitHalfOpen {
		e.circuitState = CircuitClosed
	}
}

func (e *Executor) addCost(cost float64) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.spentSoFar += cost
}
