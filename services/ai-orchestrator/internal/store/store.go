// Package store provides persistence for AI job and run records.
//
// The Store interface abstracts the database so that tests can substitute
// an in-memory implementation. The Postgres-backed implementation uses
// pgxpool to match the schema in migrations/0039_phase12_ai_copilot.up.sql.
package store

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// JobStatus represents the lifecycle state of an AI job.
type JobStatus string

const (
	StatusQueued    JobStatus = "queued"
	StatusRunning   JobStatus = "running"
	StatusSucceeded JobStatus = "succeeded"
	StatusFailed    JobStatus = "failed"
	StatusCancelled JobStatus = "cancelled"
	StatusPartial   JobStatus = "partial"
)

// Job is a Go representation of one row in the ai_job table.
type Job struct {
	ID             string          `json:"id"`
	WorkspaceID    string          `json:"workspace_id"`
	RequestedBy    string          `json:"requested_by"`
	IdempotencyKey string          `json:"idempotency_key"`
	JobType        string          `json:"job_type"`
	Status         JobStatus       `json:"status"`
	Payload        json.RawMessage `json:"payload"`
	Constraints    json.RawMessage `json:"constraints"`
	Result         json.RawMessage `json:"result,omitempty"`
	Error          json.RawMessage `json:"error,omitempty"`
	CostCents      int32           `json:"cost_cents"`
	CreatedAt      time.Time       `json:"created_at"`
	UpdatedAt      time.Time       `json:"updated_at"`
	StartedAt      *time.Time      `json:"started_at,omitempty"`
	CompletedAt    *time.Time      `json:"completed_at,omitempty"`
}

// Run represents a single row in the ai_run table.
type Run struct {
	ID           string          `json:"id"`
	JobID        string          `json:"job_id"`
	ParentRunID  *string         `json:"parent_run_id,omitempty"`
	StepName     string          `json:"step_name"`
	ModelClass   string          `json:"model_class,omitempty"`
	ModelID      string          `json:"model_id,omitempty"`
	PromptHash   string          `json:"prompt_hash,omitempty"`
	PromptRef    string          `json:"prompt_ref,omitempty"`
	InputTokens  *int32          `json:"input_tokens,omitempty"`
	OutputTokens *int32          `json:"output_tokens,omitempty"`
	CostCents    *int32          `json:"cost_cents,omitempty"`
	Status       string          `json:"status"`
	Error        json.RawMessage `json:"error,omitempty"`
	StartedAt    time.Time       `json:"started_at"`
	CompletedAt  *time.Time      `json:"completed_at,omitempty"`
}

// ---------------------------------------------------------------------------
// Store — persistence abstraction for testability.
// ---------------------------------------------------------------------------

// Store abstracts the database for job and run persistence.
type Store interface {
	// CreateJob inserts a new job and returns it. Returns an error if the
	// idempotency key already exists for the workspace.
	CreateJob(ctx context.Context, job *Job) error

	// GetJob retrieves a job by ID.
	GetJob(ctx context.Context, id string) (*Job, error)

	// MarkJobRunning transitions a job to 'running' status.
	MarkJobRunning(ctx context.Context, id string) error

	// MarkJobSucceeded transitions a job to 'succeeded' status.
	MarkJobSucceeded(ctx context.Context, id string, result json.RawMessage) error

	// MarkJobFailed transitions a job to 'failed' status.
	MarkJobFailed(ctx context.Context, id string, jobErr json.RawMessage) error

	// CreateRun inserts a new ai_run record for a job step.
	CreateRun(ctx context.Context, run *Run) error
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

// CreateJob inserts a new ai_job row with gen_random_uuid().
func (s *pgxStore) CreateJob(ctx context.Context, job *Job) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO ai_job (id, workspace_id, requested_by, idempotency_key,
			job_type, status, payload, constraints, cost_cents)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`, job.ID, job.WorkspaceID, job.RequestedBy, job.IdempotencyKey,
		job.JobType, job.Status, job.Payload, job.Constraints, job.CostCents,
	)
	if err != nil {
		return fmt.Errorf("create job: %w", err)
	}
	return nil
}

// GetJob retrieves a job by ID.
func (s *pgxStore) GetJob(ctx context.Context, id string) (*Job, error) {
	j := &Job{}
	err := s.pool.QueryRow(ctx, `
		SELECT id, workspace_id, requested_by, idempotency_key,
			job_type, status, payload, constraints, result, error,
			cost_cents, created_at, updated_at, started_at, completed_at
		FROM ai_job WHERE id = $1
	`, id).Scan(
		&j.ID, &j.WorkspaceID, &j.RequestedBy, &j.IdempotencyKey,
		&j.JobType, &j.Status, &j.Payload, &j.Constraints,
		&j.Result, &j.Error,
		&j.CostCents, &j.CreatedAt, &j.UpdatedAt,
		&j.StartedAt, &j.CompletedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("job %s not found", id)
	}
	if err != nil {
		return nil, fmt.Errorf("get job: %w", err)
	}
	return j, nil
}

// MarkJobRunning sets status = 'running' and started_at = now().
func (s *pgxStore) MarkJobRunning(ctx context.Context, id string) error {
	tag, err := s.pool.Exec(ctx, `
		UPDATE ai_job
		SET status = 'running', started_at = now(), updated_at = now()
		WHERE id = $1
	`, id)
	if err != nil {
		return fmt.Errorf("mark job running: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("job %s not found", id)
	}
	return nil
}

// MarkJobSucceeded sets status = 'succeeded', result, and completed_at.
func (s *pgxStore) MarkJobSucceeded(ctx context.Context, id string, result json.RawMessage) error {
	tag, err := s.pool.Exec(ctx, `
		UPDATE ai_job
		SET status = 'succeeded', result = $2, completed_at = now(), updated_at = now()
		WHERE id = $1
	`, id, result)
	if err != nil {
		return fmt.Errorf("mark job succeeded: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("job %s not found", id)
	}
	return nil
}

// MarkJobFailed sets status = 'failed', error, and completed_at.
func (s *pgxStore) MarkJobFailed(ctx context.Context, id string, jobErr json.RawMessage) error {
	tag, err := s.pool.Exec(ctx, `
		UPDATE ai_job
		SET status = 'failed', error = $2, completed_at = now(), updated_at = now()
		WHERE id = $1
	`, id, jobErr)
	if err != nil {
		return fmt.Errorf("mark job failed: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("job %s not found", id)
	}
	return nil
}

// CreateRun inserts a new ai_run row.
func (s *pgxStore) CreateRun(ctx context.Context, run *Run) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO ai_run (id, job_id, parent_run_id, step_name,
			model_class, model_id, prompt_hash, prompt_ref,
			input_tokens, output_tokens, cost_cents, status, error,
			started_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
	`, run.ID, run.JobID, run.ParentRunID, run.StepName,
		run.ModelClass, run.ModelID, run.PromptHash, run.PromptRef,
		run.InputTokens, run.OutputTokens, run.CostCents, run.Status,
		run.Error, run.StartedAt,
	)
	if err != nil {
		return fmt.Errorf("create run: %w", err)
	}
	return nil
}

// ---------------------------------------------------------------------------
// MemStore — in-memory Store for unit tests.
// ---------------------------------------------------------------------------

// MemStore is a thread-safe in-memory Store for testing.
type MemStore struct {
	mu   sync.RWMutex
	Jobs map[string]*Job
	Runs []*Run
}

// NewMemStore returns a ready-to-use MemStore.
func NewMemStore() *MemStore {
	return &MemStore{Jobs: make(map[string]*Job)}
}

// CreateJob inserts a job into the in-memory store.
func (m *MemStore) CreateJob(_ context.Context, job *Job) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.Jobs[job.ID] = job
	return nil
}

// GetJob retrieves a job by ID.
func (m *MemStore) GetJob(_ context.Context, id string) (*Job, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	j, ok := m.Jobs[id]
	if !ok {
		return nil, fmt.Errorf("job %s not found", id)
	}
	return j, nil
}

// MarkJobRunning sets a job's status to 'running'.
func (m *MemStore) MarkJobRunning(_ context.Context, id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	j, ok := m.Jobs[id]
	if !ok {
		return fmt.Errorf("job %s not found", id)
	}
	now := time.Now()
	j.Status = StatusRunning
	j.StartedAt = &now
	j.UpdatedAt = now
	return nil
}

// MarkJobSucceeded sets a job's status to 'succeeded'.
func (m *MemStore) MarkJobSucceeded(_ context.Context, id string, result json.RawMessage) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	j, ok := m.Jobs[id]
	if !ok {
		return fmt.Errorf("job %s not found", id)
	}
	now := time.Now()
	j.Status = StatusSucceeded
	j.Result = result
	j.CompletedAt = &now
	j.UpdatedAt = now
	return nil
}

// MarkJobFailed sets a job's status to 'failed'.
func (m *MemStore) MarkJobFailed(_ context.Context, id string, jobErr json.RawMessage) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	j, ok := m.Jobs[id]
	if !ok {
		return fmt.Errorf("job %s not found", id)
	}
	now := time.Now()
	j.Status = StatusFailed
	j.Error = jobErr
	j.CompletedAt = &now
	j.UpdatedAt = now
	return nil
}

// CreateRun appends a run to the in-memory store.
func (m *MemStore) CreateRun(_ context.Context, run *Run) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.Runs = append(m.Runs, run)
	return nil
}
