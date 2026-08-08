// Package registry is the benchmark CRUD orchestrator. It wraps the
// underlying store, enforces validation, and computes the
// reproducible SHA-256 payload signature over a benchmark's identity.
//
// The signature is intended for "frozen export" workflows: a downstream
// pipeline publishes the signed payload to a stable location (e.g. an
// external benchmarking portal) and the recipient verifies the
// signature has not been tampered with.
//
// Signing uses canonical JSON: keys are alphabetised and the result is
// hashed with SHA-256, hex-encoded. The signature is deterministic so
// that two systems signing the same payload produce the same output.
package registry

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"time"

	"github.com/google/uuid"

	"github.com/domio/platform/services/benchmark/internal/model"
	"github.com/domio/platform/services/benchmark/internal/store"
)

// ErrInvalidPayload — required fields are missing.
var ErrInvalidPayload = errors.New("registry: invalid benchmark payload")

// Service is the public API of this package.
type Service struct {
	Store store.Store
	Now   func() time.Time
}

// New builds a Service. Pass a nil store to use the in-memory seeded
// store — the test harness does this.
func New(s store.Store) *Service {
	if s == nil {
		s = store.NewSeededInMemoryStore()
	}
	return &Service{Store: s, Now: time.Now}
}

// Register validates and persists a new benchmark.
func (s *Service) Register(ctx context.Context, b model.Benchmark) (model.Benchmark, error) {
	if err := validate(b); err != nil {
		return model.Benchmark{}, err
	}
	if b.SignSalt == "" {
		b.SignSalt = uuid.New().String()
	}
	return s.Store.Register(ctx, b)
}

// Get returns one benchmark, scoped to the workspace.
func (s *Service) Get(ctx context.Context, ws, id uuid.UUID) (model.Benchmark, error) {
	return s.Store.Get(ctx, ws, id)
}

// List returns benchmarks matching the filter.
func (s *Service) List(ctx context.Context, f model.BenchmarkFilter) ([]model.Benchmark, error) {
	if f.WorkspaceID == uuid.Nil {
		return nil, fmt.Errorf("%w: workspace_id required", ErrInvalidPayload)
	}
	return s.Store.List(ctx, f)
}

// Archive marks a benchmark as archived.
func (s *Service) Archive(ctx context.Context, ws, id uuid.UUID) (model.Benchmark, error) {
	return s.Store.Archive(ctx, ws, id)
}

// SignPayload returns a deterministic SHA-256 signature for the
// benchmark. The signing input is the canonical-JSON projection of
// (benchmark_id, workspace_id, name, metric_name, variant_a_key,
// variant_b_key, method, sign_salt). Two services signing the same
// payload produce the same signature; this is the property that lets
// downstream verifiers reproduce the digest without contacting us.
//
// The chain pointer (ChainPrev) is intentionally excluded — chains
// have their own signature protocol (HMAC over the chain head).
func (s *Service) SignPayload(b model.Benchmark) (string, error) {
	if err := validate(b); err != nil {
		return "", err
	}
	canonical, err := canonicalJSON(map[string]interface{}{
		"benchmark_id":   b.BenchmarkID.String(),
		"workspace_id":   b.WorkspaceID.String(),
		"name":           b.Name,
		"metric_name":    b.MetricName,
		"variant_a_key":  b.VariantAKey,
		"variant_b_key":  b.VariantBKey,
		"method":         string(b.Method),
		"sign_salt":      b.SignSalt,
	})
	if err != nil {
		return "", fmt.Errorf("canonicalise: %w", err)
	}
	sum := sha256.Sum256(canonical)
	return hex.EncodeToString(sum[:]), nil
}

// VerifySignature re-derives the signature and compares it to sig.
// Returns true if the signature matches.
func (s *Service) VerifySignature(b model.Benchmark, sig string) (bool, error) {
	got, err := s.SignPayload(b)
	if err != nil {
		return false, err
	}
	// Constant-time compare.
	if len(got) != len(sig) {
		return false, nil
	}
	var diff byte
	for i := 0; i < len(got); i++ {
		diff |= got[i] ^ sig[i]
	}
	return diff == 0, nil
}

// canonicalJSON marshals m with sorted keys so two maps with the same
// key/value pairs (in any order) yield identical bytes. It is not a
// fully general canonicaliser — it operates on one level of map only,
// which is what SignPayload needs.
func canonicalJSON(m map[string]interface{}) ([]byte, error) {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	type kv struct {
		Key string      `json:"k"`
		Val interface{} `json:"v"`
	}
	pairs := make([]kv, 0, len(keys))
	for _, k := range keys {
		pairs = append(pairs, kv{Key: k, Val: m[k]})
	}
	return json.Marshal(pairs)
}

func validate(b model.Benchmark) error {
	if b.WorkspaceID == uuid.Nil {
		return fmt.Errorf("%w: workspace_id required", ErrInvalidPayload)
	}
	if b.Name == "" {
		return fmt.Errorf("%w: name required", ErrInvalidPayload)
	}
	if b.MetricName == "" {
		return fmt.Errorf("%w: metric_name required", ErrInvalidPayload)
	}
	if b.VariantAKey == "" || b.VariantBKey == "" {
		return fmt.Errorf("%w: variant_a_key and variant_b_key required", ErrInvalidPayload)
	}
	switch b.Method {
	case model.MethodWelchT, model.MethodMannWhitney, model.MethodBayesianNormal:
	case "":
		// Empty method is filled in by the store layer.
	default:
		return fmt.Errorf("%w: unknown method %q", ErrInvalidPayload, b.Method)
	}
	if b.ChainPrev != nil && *b.ChainPrev == uuid.Nil {
		return fmt.Errorf("%w: chain_prev must not be uuid.Nil", ErrInvalidPayload)
	}
	return nil
}