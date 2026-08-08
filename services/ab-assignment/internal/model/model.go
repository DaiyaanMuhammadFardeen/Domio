// Package model holds the domain types for the A/B assignment service.
//
// The DB tables backing these types live in
// infrastructure/postgres/migrations/0060_analytics_ab.up.sql:
//
//   ab_test       → Test
//   ab_variant    → Variant
//   ab_assignment → AssignmentRow
//   ab_exposure   → ExposureRow
package model

import (
	"time"

	"github.com/google/uuid"
)

// Test status — string-typed to match the Postgres CHECK constraint.
// Status transitions are enforced in the service layer, not the DB
// (so a paused test can be edited without rewriting the constraint).
type TestStatus string

const (
	StatusDraft     TestStatus = "draft"
	StatusRunning   TestStatus = "running"
	StatusPaused    TestStatus = "paused"
	StatusConcluded TestStatus = "concluded"
)

// Hash basis — which keys feed the assignment hash.
type HashBasis string

const (
	HashBasisWorkspace HashBasis = "workspace_id"
	HashBasisDeck      HashBasis = "workspace_id+deck_id"
)

// Test is the experiment definition.
type Test struct {
	TestID         uuid.UUID  `json:"test_id"`
	WorkspaceID    uuid.UUID  `json:"workspace_id"`
	Name           string     `json:"name"`
	Description    string     `json:"description,omitempty"`
	Status         TestStatus `json:"status"`
	HashBasis      HashBasis  `json:"hash_basis"`
	HashSalt       string     `json:"-"`
	StartedAt      *time.Time `json:"started_at,omitempty"`
	EndedAt        *time.Time `json:"ended_at,omitempty"`
	MinSampleSize  int        `json:"min_sample_size"`
	ExposureEvent  string     `json:"exposure_event"`
	ConversionEvent string    `json:"conversion_event"`
	AlphaBudget    float64    `json:"alpha_budget"`
	CreatedAt      time.Time  `json:"created_at"`
	CreatedBy      *uuid.UUID `json:"created_by,omitempty"`
}

// Variant is one arm of a Test.
type Variant struct {
	VariantID  uuid.UUID `json:"variant_id"`
	TestID     uuid.UUID `json:"test_id"`
	WorkspaceID uuid.UUID `json:"workspace_id"`
	VariantKey string    `json:"variant_key"`
	Weight     int       `json:"weight"`
	Payload    []byte    `json:"payload,omitempty"` // JSONB
	CreatedAt  time.Time `json:"created_at"`
}

// AssignmentRow is a stored cache of the deterministic assignment.
type AssignmentRow struct {
	AssignmentID uuid.UUID `json:"assignment_id"`
	WorkspaceID  uuid.UUID `json:"workspace_id"`
	TestID       uuid.UUID `json:"test_id"`
	ViewerIDKey  string    `json:"viewer_id_key"`
	VariantID    uuid.UUID `json:"variant_id"`
	Bucket       float64   `json:"bucket"`
	AssignedAt   time.Time `json:"assigned_at"`
}

// ExposureRow records one exposure event for audit and measurement.
type ExposureRow struct {
	ExposureID     uuid.UUID `json:"exposure_id"`
	WorkspaceID    uuid.UUID `json:"workspace_id"`
	TestID         uuid.UUID `json:"test_id"`
	ViewerIDKey    string    `json:"viewer_id_key"`
	VariantID      uuid.UUID `json:"variant_id"`
	ExposureEvent  string    `json:"exposure_event"`
	IsConversion   int       `json:"is_conversion"`
	OccurredAt     time.Time `json:"occurred_at"`
	CHEventID      string    `json:"ch_event_id,omitempty"`
}

// AssignmentResult is the public response shape returned to clients.
type AssignmentResult struct {
	TestID      uuid.UUID `json:"test_id"`
	VariantID   uuid.UUID `json:"variant_id"`
	VariantKey  string    `json:"variant_key"`
	Bucket      float64   `json:"bucket"`
	Payload     []byte    `json:"payload,omitempty"`
	AssignedAt  time.Time `json:"assigned_at"`
	FromCache   bool      `json:"from_cache"`
}