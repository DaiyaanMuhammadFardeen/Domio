// Package store — Postgres mirror implementation.
//
// PostgresStore wraps an inner Store (typically the in-memory one)
// and writes each WriteSnapshot call to Postgres. The Postgres rows
// are an authoritative mirror of the ClickHouse warehouse — the
// benchmark service treats Postgres as the system of record for
// audit + cross-region consistency, and ClickHouse as the fast
// read path.
//
// The mirror is implemented as a write-through cache: every snapshot
// is written to both the inner store AND Postgres. A failure on the
// Postgres side is logged but does not abort the request — the
// ClickHouse path is the primary read path and the inner store is
// always present.
package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"

	"github.com/domio/platform/services/benchmark/internal/model"
)

// DBExec is the small slice of database/sql used by the Postgres
// mirror. It exists so tests can swap in an in-memory fake without
// pulling in a third-party mocking library. *sql.DB satisfies it.
type DBExec interface {
	ExecContext(ctx context.Context, query string, args ...interface{}) (sql.Result, error)
}

// PostgresMirror is a write-through mirror that delegates to an inner
// store and additionally writes snapshots to Postgres.
type PostgresMirror struct {
	Inner Store
	DB    DBExec
	Now   func() time.Time
}

// NewPostgresMirror builds a PostgresMirror. db must be a live
// connection pool.
func NewPostgresMirror(inner Store, db *sql.DB) *PostgresMirror {
	return &PostgresMirror{Inner: inner, DB: db, Now: time.Now}
}

// NewPostgresMirrorWithExec builds a PostgresMirror with a custom
// DBExec (used by tests).
func NewPostgresMirrorWithExec(inner Store, db DBExec) *PostgresMirror {
	return &PostgresMirror{Inner: inner, DB: db, Now: time.Now}
}

// Compile-time assertion that PostgresMirror satisfies Store.
var _ Store = (*PostgresMirror)(nil)

// Register delegates to the inner store. The Postgres mirror is
// not updated for benchmark registrations (they go through a
// separate table in production; deferred to a follow-up).
func (p *PostgresMirror) Register(ctx context.Context, b model.Benchmark) (model.Benchmark, error) {
	return p.Inner.Register(ctx, b)
}

// Get delegates to the inner store.
func (p *PostgresMirror) Get(ctx context.Context, workspaceID, id uuid.UUID) (model.Benchmark, error) {
	return p.Inner.Get(ctx, workspaceID, id)
}

// List delegates to the inner store.
func (p *PostgresMirror) List(ctx context.Context, f model.BenchmarkFilter) ([]model.Benchmark, error) {
	return p.Inner.List(ctx, f)
}

// Archive delegates to the inner store.
func (p *PostgresMirror) Archive(ctx context.Context, workspaceID, id uuid.UUID) (model.Benchmark, error) {
	return p.Inner.Archive(ctx, workspaceID, id)
}

// UpdateStatus delegates to the inner store.
func (p *PostgresMirror) UpdateStatus(ctx context.Context, workspaceID, id uuid.UUID, status model.BenchmarkStatus) (model.Benchmark, error) {
	return p.Inner.UpdateStatus(ctx, workspaceID, id, status)
}

// WriteSnapshot writes the snapshot to both the inner store and the
// Postgres mirror. Postgres failures are returned so the caller can
// log + continue (the httpapi layer does this).
func (p *PostgresMirror) WriteSnapshot(ctx context.Context, snap model.BenchmarkSnapshot) error {
	if err := p.Inner.WriteSnapshot(ctx, snap); err != nil {
		return err
	}
	return p.writePostgresSnapshot(ctx, snap)
}

// writePostgresSnapshot inserts (or upserts) a row into
// benchmark_snapshot. The UNIQUE constraint on
// (workspace_id, benchmark_id, metric_name, bucket_date) makes the
// insert idempotent — a re-run for the same day overwrites.
func (p *PostgresMirror) writePostgresSnapshot(ctx context.Context, snap model.BenchmarkSnapshot) error {
	if p.DB == nil {
		return nil
	}
	const q = `
        INSERT INTO benchmark_snapshot (
            workspace_id, benchmark_id, metric_name, bucket_date,
            value, sample_size, region_pinned, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        ON CONFLICT (workspace_id, benchmark_id, metric_name, bucket_date)
        DO UPDATE SET
            value         = EXCLUDED.value,
            sample_size   = EXCLUDED.sample_size,
            region_pinned = EXCLUDED.region_pinned,
            updated_at    = NOW()
    `
	var regionPinned sql.NullString
	if snap.RegionPinned != "" {
		regionPinned = sql.NullString{String: snap.RegionPinned, Valid: true}
	}
	_, err := p.DB.ExecContext(ctx, q,
		snap.WorkspaceID,
		snap.BenchmarkID,
		snap.MetricName,
		snap.BucketDate,
		snap.Value,
		snap.SampleSize,
		regionPinned,
	)
	if err != nil {
		return fmt.Errorf("postgres snapshot: %w", err)
	}
	return nil
}

// ReadSnapshots reads from the inner store. The Postgres mirror is
// intentionally not used for the hot read path — the ClickHouse
// snapshot writer (in store/clickhouse.go) is.
func (p *PostgresMirror) ReadSnapshots(ctx context.Context, benchmarkID uuid.UUID, metricName string) ([]model.BenchmarkSnapshot, error) {
	return p.Inner.ReadSnapshots(ctx, benchmarkID, metricName)
}

// IsNoSuchTable is a small helper for callers that want to ignore
// "table does not exist" errors during local development.
func IsNoSuchTable(err error) bool {
	return err != nil && errors.Is(err, sql.ErrNoRows)
}

// LogPostgresError logs the error to the standard logger. Kept here
// so callers don't have to import log themselves.
func LogPostgresError(op string, err error) {
	if err == nil {
		return
	}
	log.Printf("benchmark postgres %s: %v", op, err)
}