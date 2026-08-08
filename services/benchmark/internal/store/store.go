// Package store provides the persistence layer for the benchmark
// service.
//
// Three implementations ship in this package:
//
//   * InMemory — goroutine-safe, pre-seeded with 4 fixtures. Used by
//                tests and by the in-process smoke harness.
//   * ClickHouse — JSONEachRow writer + reader against
//                  domio_analytics.benchmark_snapshot.
//   * Postgres — write-through mirror when DATABASE_URL is set
//                (mirror of 0063_analytics_benchmarks.up.sql).
package store

import (
	"context"

	"github.com/google/uuid"

	"github.com/domio/platform/services/benchmark/internal/model"
)

// Store is the persistence interface for the benchmark service.
// InMemoryStore is the reference implementation; Postgres and
// ClickHouse clients layer on top.
type Store interface {
	Register(ctx context.Context, b model.Benchmark) (model.Benchmark, error)
	Get(ctx context.Context, workspaceID, id uuid.UUID) (model.Benchmark, error)
	List(ctx context.Context, f model.BenchmarkFilter) ([]model.Benchmark, error)
	Archive(ctx context.Context, workspaceID, id uuid.UUID) (model.Benchmark, error)
	UpdateStatus(ctx context.Context, workspaceID, id uuid.UUID, status model.BenchmarkStatus) (model.Benchmark, error)
	WriteSnapshot(ctx context.Context, snap model.BenchmarkSnapshot) error
	ReadSnapshots(ctx context.Context, benchmarkID uuid.UUID, metricName string) ([]model.BenchmarkSnapshot, error)
}

// Compile-time assertion: InMemoryStore satisfies Store.
var _ Store = (*InMemoryStore)(nil)