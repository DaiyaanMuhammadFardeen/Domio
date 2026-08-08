// Package store provides the persistence layer for ab-assignment.
//
// Two implementations:
//
//   * InMemory — used by tests. Keyed by (workspace_id, test_id,
//     viewer_id_key).
//   * Postgres — production. Uses pgx and the Postgres RLS policy in
//     0060_analytics_ab.up.sql.
//
// The ClickHouse exposure writer lives in cmd/ab-assignment (it does
// a fire-and-forget insert from the hot path). The store interface is
// deliberately Postgres-shaped so we don't tempt ourselves to call
// ClickHouse from the assignment hot path.
package store

import (
	"context"
	"errors"

	"github.com/google/uuid"

	"github.com/domio/platform/services/ab-assignment/internal/model"
)

// ErrNotFound — request returned no row.
var ErrNotFound = errors.New("store: not found")

// Store is the persistence interface for ab-assignment.
type Store interface {
	GetTest(ctx context.Context, workspaceID, testID uuid.UUID) (model.Test, error)
	GetTestByName(ctx context.Context, workspaceID uuid.UUID, name string) (model.Test, error)
	ListTests(ctx context.Context, workspaceID uuid.UUID) ([]model.Test, error)
	CreateTest(ctx context.Context, t model.Test) (model.Test, error)
	UpdateTest(ctx context.Context, t model.Test) (model.Test, error)

	ListVariants(ctx context.Context, testID uuid.UUID) ([]model.Variant, error)
	CreateVariant(ctx context.Context, v model.Variant) (model.Variant, error)
	ReplaceVariants(ctx context.Context, testID uuid.UUID, variants []model.Variant) error

	GetAssignment(ctx context.Context, testID uuid.UUID, viewerIDKey string) (model.AssignmentRow, error)
	UpsertAssignment(ctx context.Context, a model.AssignmentRow) (model.AssignmentRow, error)

	RecordExposure(ctx context.Context, e model.ExposureRow) (model.ExposureRow, error)
	ListExposures(ctx context.Context, testID uuid.UUID, sinceUnixMs int64) ([]model.ExposureRow, error)
}