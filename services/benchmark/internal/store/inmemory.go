// Package store provides the persistence layer for the benchmark
// service. Two implementations ship with this package:
//
//   * InMemory — goroutine-safe, pre-seeded with 4 fixtures. Used by
//                tests and by the in-process smoke harness.
//   * ClickHouse — JSONEachRow writer + reader against
//                  domio_analytics.benchmark_snapshot
//                  (infrastructure/clickhouse/init/007_phase17_benchmark.sql).
//
// The Postgres mirror, when DATABASE_URL is set, is layered by
// store/postgres.go.
package store

import (
	"context"
	"errors"
	"sort"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/domio/platform/services/benchmark/internal/model"
)

// ErrNotFound is returned when a lookup misses.
var ErrNotFound = errors.New("benchstore: not found")

// ErrConflict is returned when a unique key (BenchmarkID) is already
// registered. Callers should treat this as "do not overwrite".
var ErrConflict = errors.New("benchstore: benchmark_id already exists")

// InMemoryStore is the test-time, goroutine-safe registry. It mirrors
// the API shape of the production ClickHouse + Postgres paths so
// callers can swap implementations without touching business logic.
type InMemoryStore struct {
	mu         sync.RWMutex
	benchmarks map[uuid.UUID]model.Benchmark
	// secondary index: (workspace_id, name) → uuid, used to enforce
	// uniqueness on Register.
	byName      map[string]uuid.UUID
	snapshots   map[string]model.BenchmarkSnapshot // key = benchmark_id|metric_name|bucket_date
}

// NewInMemoryStore returns an empty store. Tests typically call
// NewSeededInMemoryStore() to get the 4-fixture set.
func NewInMemoryStore() *InMemoryStore {
	return &InMemoryStore{
		benchmarks: map[uuid.UUID]model.Benchmark{},
		byName:     map[string]uuid.UUID{},
		snapshots:  map[string]model.BenchmarkSnapshot{},
	}
}

// NewSeededInMemoryStore returns a store pre-populated with 4 fixture
// benchmarks covering all 3 inference methods.
func NewSeededInMemoryStore() *InMemoryStore {
	s := NewInMemoryStore()
	now := time.Now().UTC()
	fixtures := []model.Benchmark{
		{
			BenchmarkID: uuid.MustParse("11111111-1111-1111-1111-111111111111"),
			WorkspaceID: uuid.MustParse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
			Name:        "dwell_ms_control_vs_treatment",
			Description: "Session dwell time control vs treatment deck",
			MetricName:  "session_dwell_ms",
			VariantAKey: "control",
			VariantBKey: "treatment",
			Method:      model.MethodWelchT,
			Status:      model.BenchmarkStatusActive,
			SignSalt:    "seed-salt-1",
			CreatedAt:   now.Add(-72 * time.Hour),
			UpdatedAt:   now.Add(-1 * time.Hour),
		},
		{
			BenchmarkID: uuid.MustParse("22222222-2222-2222-2222-222222222222"),
			WorkspaceID: uuid.MustParse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
			Name:        "completion_pct_pre_vs_post",
			Description: "Deck completion rate before vs after redesign",
			MetricName:  "completion_pct",
			VariantAKey: "pre",
			VariantBKey: "post",
			Method:      model.MethodMannWhitney,
			Status:      model.BenchmarkStatusActive,
			SignSalt:    "seed-salt-2",
			CreatedAt:   now.Add(-48 * time.Hour),
			UpdatedAt:   now.Add(-30 * time.Minute),
		},
		{
			BenchmarkID: uuid.MustParse("33333333-3333-3333-3333-333333333333"),
			WorkspaceID: uuid.MustParse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"),
			Name:        "conversion_pct_a_vs_b",
			Description: "Landing page conversion A vs B",
			MetricName:  "conversion_pct",
			VariantAKey: "variant_a",
			VariantBKey: "variant_b",
			Method:      model.MethodBayesianNormal,
			Status:      model.BenchmarkStatusActive,
			SignSalt:    "seed-salt-3",
			CreatedAt:   now.Add(-24 * time.Hour),
			UpdatedAt:   now.Add(-5 * time.Minute),
		},
		{
			BenchmarkID: uuid.MustParse("44444444-4444-4444-4444-444444444444"),
			WorkspaceID: uuid.MustParse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
			Name:        "engagement_score_draft",
			Description: "Engagement score draft (not yet active)",
			MetricName:  "engagement_score",
			VariantAKey: "draft_a",
			VariantBKey: "draft_b",
			Method:      model.MethodWelchT,
			Status:      model.BenchmarkStatusDraft,
			SignSalt:    "seed-salt-4",
			CreatedAt:   now.Add(-2 * time.Hour),
			UpdatedAt:   now.Add(-1 * time.Hour),
		},
	}
	for _, b := range fixtures {
		s.benchmarks[b.BenchmarkID] = b
		s.byName[nameKey(b.WorkspaceID, b.Name)] = b.BenchmarkID
	}
	return s
}

func nameKey(ws uuid.UUID, name string) string {
	return ws.String() + "|" + name
}

func snapshotKey(bid uuid.UUID, metric string, day time.Time) string {
	return bid.String() + "|" + metric + "|" + day.UTC().Format("2006-01-02")
}

// Register inserts a new benchmark. If BenchmarkID is the zero UUID a
// new one is minted. If the (workspace_id, name) pair already exists
// or BenchmarkID is already present, ErrConflict is returned.
func (s *InMemoryStore) Register(ctx context.Context, b model.Benchmark) (model.Benchmark, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if b.BenchmarkID == uuid.Nil {
		b.BenchmarkID = uuid.New()
	}
	if _, ok := s.benchmarks[b.BenchmarkID]; ok {
		return model.Benchmark{}, ErrConflict
	}
	if _, ok := s.byName[nameKey(b.WorkspaceID, b.Name)]; ok {
		return model.Benchmark{}, ErrConflict
	}
	if b.CreatedAt.IsZero() {
		b.CreatedAt = time.Now().UTC()
	}
	b.UpdatedAt = time.Now().UTC()
	if b.Status == "" {
		b.Status = model.BenchmarkStatusActive
	}
	if b.Method == "" {
		b.Method = model.MethodWelchT
	}
	s.benchmarks[b.BenchmarkID] = b
	s.byName[nameKey(b.WorkspaceID, b.Name)] = b.BenchmarkID
	return b, nil
}

// Get returns one benchmark by id, scoped to the workspace.
func (s *InMemoryStore) Get(ctx context.Context, workspaceID, id uuid.UUID) (model.Benchmark, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	b, ok := s.benchmarks[id]
	if !ok {
		return model.Benchmark{}, ErrNotFound
	}
	if b.WorkspaceID != workspaceID {
		// Cross-tenant access is masked as not-found (mirrors the
		// Postgres RLS invariant).
		return model.Benchmark{}, ErrNotFound
	}
	return b, nil
}

// List returns benchmarks matching the filter, sorted by UpdatedAt
// descending. WorkspaceID is required.
func (s *InMemoryStore) List(ctx context.Context, f model.BenchmarkFilter) ([]model.Benchmark, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]model.Benchmark, 0, len(s.benchmarks))
	for _, b := range s.benchmarks {
		if f.WorkspaceID != uuid.Nil && b.WorkspaceID != f.WorkspaceID {
			continue
		}
		if f.Status != "" && b.Status != f.Status {
			continue
		}
		if f.Method != "" && b.Method != f.Method {
			continue
		}
		out = append(out, b)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].UpdatedAt.Equal(out[j].UpdatedAt) {
			return out[i].Name < out[j].Name
		}
		return out[i].UpdatedAt.After(out[j].UpdatedAt)
	})
	// Pagination.
	offset := f.Offset
	if offset < 0 {
		offset = 0
	}
	limit := f.Limit
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	if offset >= len(out) {
		return []model.Benchmark{}, nil
	}
	end := offset + limit
	if end > len(out) {
		end = len(out)
	}
	return out[offset:end], nil
}

// Archive marks a benchmark as archived. Idempotent.
func (s *InMemoryStore) Archive(ctx context.Context, workspaceID, id uuid.UUID) (model.Benchmark, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	b, ok := s.benchmarks[id]
	if !ok {
		return model.Benchmark{}, ErrNotFound
	}
	if b.WorkspaceID != workspaceID {
		return model.Benchmark{}, ErrNotFound
	}
	b.Status = model.BenchmarkStatusArchived
	b.UpdatedAt = time.Now().UTC()
	s.benchmarks[id] = b
	return b, nil
}

// UpdateStatus mutates a benchmark's status (used by patch operations).
func (s *InMemoryStore) UpdateStatus(ctx context.Context, workspaceID, id uuid.UUID, status model.BenchmarkStatus) (model.Benchmark, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	b, ok := s.benchmarks[id]
	if !ok {
		return model.Benchmark{}, ErrNotFound
	}
	if b.WorkspaceID != workspaceID {
		return model.Benchmark{}, ErrNotFound
	}
	b.Status = status
	b.UpdatedAt = time.Now().UTC()
	s.benchmarks[id] = b
	return b, nil
}

// WriteSnapshot writes a single snapshot, keyed by
// (benchmark_id, metric_name, bucket_date). ReplacingMergeTree
// semantics are simulated by overwriting.
func (s *InMemoryStore) WriteSnapshot(ctx context.Context, snap model.BenchmarkSnapshot) error {
	if snap.WorkspaceID == uuid.Nil || snap.BenchmarkID == uuid.Nil {
		return errors.New("benchstore: snapshot requires workspace_id and benchmark_id")
	}
	if snap.MetricName == "" {
		return errors.New("benchstore: snapshot metric_name required")
	}
	if snap.BucketDate.IsZero() {
		return errors.New("benchstore: snapshot bucket_date required")
	}
	snap.BucketDate = snap.BucketDate.UTC().Truncate(24 * time.Hour)
	if snap.UpdatedAt.IsZero() {
		snap.UpdatedAt = time.Now().UTC()
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.snapshots[snapshotKey(snap.BenchmarkID, snap.MetricName, snap.BucketDate)] = snap
	return nil
}

// ReadSnapshots returns snapshots for a benchmark, ordered by
// bucket_date ascending.
func (s *InMemoryStore) ReadSnapshots(ctx context.Context, benchmarkID uuid.UUID, metricName string) ([]model.BenchmarkSnapshot, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]model.BenchmarkSnapshot, 0)
	for _, snap := range s.snapshots {
		if snap.BenchmarkID != benchmarkID {
			continue
		}
		if metricName != "" && snap.MetricName != metricName {
			continue
		}
		out = append(out, snap)
	}
	sort.Slice(out, func(i, j int) bool {
		return out[i].BucketDate.Before(out[j].BucketDate)
	})
	return out, nil
}
