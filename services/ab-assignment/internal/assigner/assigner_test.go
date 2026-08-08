package assigner

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/domio/platform/services/ab-assignment/internal/model"
	"github.com/domio/platform/services/ab-assignment/internal/store"
)

// Compile-time check that the store.Store interface in the test file
// uses the same model types. (Go's type system handles this; the check
// just gives us a friendlier failure when the model breaks.)
var _ store.Store = (*store.InMemoryStore)(nil)

func seedTest(t *testing.T, s *store.InMemoryStore) (model.Test, []model.Variant) {
	t.Helper()
	ctx := context.Background()
	tt := model.Test{
		WorkspaceID:     uuid.New(),
		Name:            "demo",
		Status:          model.StatusRunning,
		HashBasis:       model.HashBasisWorkspace,
		ExposureEvent:   "view",
		ConversionEvent: "session_ended",
		MinSampleSize:   100,
		AlphaBudget:     0.05,
	}
	tt, err := s.CreateTest(ctx, tt)
	require.NoError(t, err)

	vs := []model.Variant{
		{TestID: tt.TestID, WorkspaceID: tt.WorkspaceID, VariantKey: "control", Weight: 50},
		{TestID: tt.TestID, WorkspaceID: tt.WorkspaceID, VariantKey: "variant_a", Weight: 50},
	}
	for i := range vs {
		vs[i], err = s.CreateVariant(ctx, vs[i])
		require.NoError(t, err)
	}
	return tt, vs
}

func TestAssignDeterminism(t *testing.T) {
	s := store.NewInMemoryStore()
	a := New(s, nil)
	tt, _ := seedTest(t, s)
	ctx := context.Background()
	r1, err := a.Assign(ctx, tt.WorkspaceID, tt.TestID, "viewer-1")
	require.NoError(t, err)
	r2, err := a.Assign(ctx, tt.WorkspaceID, tt.TestID, "viewer-1")
	require.NoError(t, err)
	assert.Equal(t, r1.VariantID, r2.VariantID)
	assert.True(t, r2.FromCache, "second call should hit the assignment cache")
}

func TestAssignNotRunning(t *testing.T) {
	s := store.NewInMemoryStore()
	a := New(s, nil)
	tt, _ := seedTest(t, s)
	tt.Status = model.StatusPaused
	_, err := s.UpdateTest(context.Background(), tt)
	require.NoError(t, err)
	_, err = a.Assign(context.Background(), tt.WorkspaceID, tt.TestID, "viewer-1")
	assert.ErrorIs(t, err, ErrTestNotRunning)
}

func TestAssignCrossWorkspaceIsolation(t *testing.T) {
	s := store.NewInMemoryStore()
	a := New(s, nil)
	tt, _ := seedTest(t, s)
	otherWorkspace := uuid.New()
	_, err := a.Assign(context.Background(), otherWorkspace, tt.TestID, "viewer-1")
	assert.ErrorIs(t, err, ErrTestNotFound)
}

func TestAssignExposureRoundTrip(t *testing.T) {
	s := store.NewInMemoryStore()
	a := New(s, nil)
	tt, vs := seedTest(t, s)
	ctx := context.Background()
	err := a.RecordExposure(ctx, model.ExposureRow{
		WorkspaceID:   tt.WorkspaceID,
		TestID:        tt.TestID,
		ViewerIDKey:   "viewer-1",
		VariantID:     vs[0].VariantID,
		ExposureEvent: "view",
		IsConversion:  0,
	})
	require.NoError(t, err)
	exposures, err := s.ListExposures(ctx, tt.TestID, 0)
	require.NoError(t, err)
	assert.Len(t, exposures, 1)
}