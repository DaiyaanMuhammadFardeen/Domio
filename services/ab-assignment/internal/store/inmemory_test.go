package store

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/domio/platform/services/ab-assignment/internal/model"
)

func newTest() model.Test {
	return model.Test{
		TestID:          uuid.New(),
		WorkspaceID:     uuid.New(),
		Name:            "test-1",
		Status:          model.StatusRunning,
		HashBasis:       model.HashBasisWorkspace,
		ExposureEvent:   "view",
		ConversionEvent: "session_ended",
		MinSampleSize:   1000,
		AlphaBudget:     0.05,
	}
}

func TestInMemoryRoundTrip(t *testing.T) {
	s := NewInMemoryStore()
	ctx := context.Background()

	t0 := newTest()
	t0, err := s.CreateTest(ctx, t0)
	require.NoError(t, err)

	got, err := s.GetTest(ctx, t0.WorkspaceID, t0.TestID)
	require.NoError(t, err)
	assert.Equal(t, t0.TestID, got.TestID)

	// Same-name lookup.
	got2, err := s.GetTestByName(ctx, t0.WorkspaceID, t0.Name)
	require.NoError(t, err)
	assert.Equal(t, t0.TestID, got2.TestID)

	// Replace variants.
	v := []model.Variant{
		{TestID: t0.TestID, WorkspaceID: t0.WorkspaceID, VariantKey: "control", Weight: 50},
		{TestID: t0.TestID, WorkspaceID: t0.WorkspaceID, VariantKey: "variant_a", Weight: 50},
	}
	require.NoError(t, s.ReplaceVariants(ctx, t0.TestID, v))
	variants, err := s.ListVariants(ctx, t0.TestID)
	require.NoError(t, err)
	assert.Len(t, variants, 2)

	// Assignment upsert.
	row := model.AssignmentRow{
		WorkspaceID: t0.WorkspaceID,
		TestID:      t0.TestID,
		ViewerIDKey: "viewer-1",
		VariantID:   variants[0].VariantID,
		Bucket:      0.42,
	}
	stored, err := s.UpsertAssignment(ctx, row)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, stored.AssignmentID)

	gotRow, err := s.GetAssignment(ctx, t0.TestID, "viewer-1")
	require.NoError(t, err)
	assert.Equal(t, row.VariantID, gotRow.VariantID)

	// Exposure.
	e := model.ExposureRow{
		WorkspaceID:   t0.WorkspaceID,
		TestID:        t0.TestID,
		ViewerIDKey:   "viewer-1",
		VariantID:     variants[0].VariantID,
		ExposureEvent: "view",
		IsConversion:  0,
	}
	_, err = s.RecordExposure(ctx, e)
	require.NoError(t, err)
	exp, err := s.ListExposures(ctx, t0.TestID, 0)
	require.NoError(t, err)
	assert.Len(t, exp, 1)
}

func TestInMemoryCrossWorkspace(t *testing.T) {
	s := NewInMemoryStore()
	ctx := context.Background()
	a := newTest()
	a.Name = "ws-a-test"
	a, err := s.CreateTest(ctx, a)
	require.NoError(t, err)
	b := newTest()
	b.Name = "ws-b-test"
	b, err = s.CreateTest(ctx, b)
	require.NoError(t, err)

	gotA, err := s.GetTestByName(ctx, a.WorkspaceID, "ws-a-test")
	require.NoError(t, err)
	assert.Equal(t, a.TestID, gotA.TestID)
	// ws-b should not see ws-a's test by name.
	_, err = s.GetTestByName(ctx, b.WorkspaceID, "ws-a-test")
	assert.True(t, errors.Is(err, ErrNotFound))
}

func TestReplaceVariantsMismatch(t *testing.T) {
	s := NewInMemoryStore()
	ctx := context.Background()
	t0 := newTest()
	t0, err := s.CreateTest(ctx, t0)
	require.NoError(t, err)
	other := uuid.New()
	err = s.ReplaceVariants(ctx, t0.TestID, []model.Variant{
		{TestID: other, VariantKey: "x", Weight: 100},
	})
	assert.ErrorIs(t, err, ErrInvalidVariant)
}