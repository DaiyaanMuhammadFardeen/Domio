// Package store provides Postgres-backed persistence for AI job records.
//
// The Store interface abstracts the database so tests can substitute an
// in-memory implementation.
package store

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ---------------------------------------------------------------------------
// Job — an AI job record matching the ai_job table schema.
// ---------------------------------------------------------------------------

// JobStatus represents the lifecycle state of an AI job.
type JobStatus string

const (
	StatusPending   JobStatus = "pending"
	StatusRunning   JobStatus = "running"
	StatusSucceeded JobStatus = "succeeded"
	StatusFailed    JobStatus = "failed"
)

// Job is a Go representation of one row in the ai_job table.
type Job struct {
	ID          string          `json:"id"`
	WorkspaceID string          `json:"workspace_id"`
	JobType     string          `json:"job_type"`
	Status      JobStatus       `json:"status"`
	Payload     json.RawMessage `json:"payload,omitempty"`
	Constraints json.RawMessage `json:"constraints,omitempty"`
	CostCents   int32           `json:"cost_cents"`
	CreatedAt   time.Time       `json:"created_at"`
	UpdatedAt   time.Time       `json:"updated_at"`
}

// ---------------------------------------------------------------------------
// Store — persistence abstraction for testability.
// ---------------------------------------------------------------------------

// Store abstracts the database so the handler can be unit-tested
// against a fake implementation.
type Store interface {
	// MarkJobRunning transitions a job to 'running' status.
	MarkJobRunning(ctx context.Context, id string) error

	// MarkJobSucceeded transitions a job to 'succeeded' status.
	MarkJobSucceeded(ctx context.Context, id string) error

	// GetJob retrieves a job by ID.
	GetJob(ctx context.Context, id string) (*Job, error)
}

// ---------------------------------------------------------------------------
// pgxStore — Postgres-backed Store implementation.
// ---------------------------------------------------------------------------

// NewPGXStore returns a Store backed by the given connection pool.
func NewPGXStore(pool *pgxpool.Pool) Store {
	return &pgxStore{pool: pool}
}

type pgxStore struct {
	pool *pgxpool.Pool
}

// MarkJobRunning sets status = 'running' and updated_at = now().
func (s *pgxStore) MarkJobRunning(ctx context.Context, id string) error {
	tag, err := s.pool.Exec(ctx,
		`UPDATE ai_job SET status = 'running', updated_at = now() WHERE id = $1`,
		id,
	)
	if err != nil {
		return fmt.Errorf("mark job running: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("job %s not found", id)
	}
	return nil
}

// MarkJobSucceeded sets status = 'succeeded' and updated_at = now().
func (s *pgxStore) MarkJobSucceeded(ctx context.Context, id string) error {
	tag, err := s.pool.Exec(ctx,
		`UPDATE ai_job SET status = 'succeeded', updated_at = now() WHERE id = $1`,
		id,
	)
	if err != nil {
		return fmt.Errorf("mark job succeeded: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("job %s not found", id)
	}
	return nil
}

// GetJob retrieves a job by ID.
func (s *pgxStore) GetJob(ctx context.Context, id string) (*Job, error) {
	j := &Job{}
	err := s.pool.QueryRow(ctx,
		`SELECT id, workspace_id, job_type, status, payload, constraints,
		        cost_cents, created_at, updated_at
		 FROM ai_job WHERE id = $1`,
		id,
	).Scan(
		&j.ID, &j.WorkspaceID, &j.JobType, &j.Status,
		&j.Payload, &j.Constraints,
		&j.CostCents, &j.CreatedAt, &j.UpdatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("job %s not found", id)
	}
	if err != nil {
		return nil, fmt.Errorf("get job: %w", err)
	}
	return j, nil
}

// ---------------------------------------------------------------------------
// MemStore — in-memory Store for unit tests.
// ---------------------------------------------------------------------------

// MemStore is a thread-safe in-memory Store for testing.
type MemStore struct {
	Jobs map[string]*Job
}

// NewMemStore returns a ready-to-use MemStore.
func NewMemStore() *MemStore {
	return &MemStore{Jobs: make(map[string]*Job)}
}

// MarkJobRunning sets a job's status to 'running'.
func (m *MemStore) MarkJobRunning(_ context.Context, id string) error {
	j, ok := m.Jobs[id]
	if !ok {
		return fmt.Errorf("job %s not found", id)
	}
	j.Status = StatusRunning
	j.UpdatedAt = time.Now()
	return nil
}

// MarkJobSucceeded sets a job's status to 'succeeded'.
func (m *MemStore) MarkJobSucceeded(_ context.Context, id string) error {
	j, ok := m.Jobs[id]
	if !ok {
		return fmt.Errorf("job %s not found", id)
	}
	j.Status = StatusSucceeded
	j.UpdatedAt = time.Now()
	return nil
}

// GetJob retrieves a job by ID.
func (m *MemStore) GetJob(_ context.Context, id string) (*Job, error) {
	j, ok := m.Jobs[id]
	if !ok {
		return nil, fmt.Errorf("job %s not found", id)
	}
	return j, nil
}
