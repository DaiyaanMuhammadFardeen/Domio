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

// TestCrossWorkspaceContamination is the property test that matters
// here: two workspaces, same test id is impossible (UUIDs are random)
// but two workspaces with the same name must not allow a viewer to be
// assigned via the other workspace's id. We simulate the malicious
// path: caller passes workspace A but the test belongs to workspace B.
//
// The assigner MUST refuse and return ErrTestNotFound.
func TestCrossWorkspaceContamination(t *testing.T) {
	s := store.NewInMemoryStore()
	a := New(s, nil)
	ctx := context.Background()

	// Set up workspace B's test.
	wsB := uuid.New()
	tt := model.Test{
		WorkspaceID:     wsB,
		Name:            "tenantB-promo",
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
		{TestID: tt.TestID, WorkspaceID: tt.WorkspaceID, VariantKey: "v1", Weight: 50},
	}
	for i := range vs {
		vs[i], err = s.CreateVariant(ctx, vs[i])
		require.NoError(t, err)
	}

	// Now attacker (workspace A) tries to assign a viewer using
	// workspace B's test id.
	wsA := uuid.New()
	_, err = a.Assign(ctx, wsA, tt.TestID, "victim-viewer")
	assert.ErrorIs(t, err, ErrTestNotFound, "cross-workspace assign must be refused")

	// Even if the test is "running", the assignment is rejected because
	// the cache entry's workspace doesn't match.
	// Force a cache load from workspace A (which should fail):
	_, err = a.Assign(ctx, wsA, tt.TestID, "victim-viewer-2")
	assert.ErrorIs(t, err, ErrTestNotFound)
}

// TestDeterminismAcrossRestarts verifies that two assigns from
// different Assigner instances (simulating service restart) give the
// same result for the same (workspace, experiment, salt, viewer) tuple.
// The hash is pure so this is true by construction, but the test
// documents the property so future changes to the salt handling can't
// silently break it.
func TestDeterminismAcrossRestarts(t *testing.T) {
	ctx := context.Background()

	type result struct {
		testID    uuid.UUID
		viewer    string
		variantA  string
		variantB  string
	}

	salt := uuid.NewString()
	testID := uuid.New()
	workspaceID := uuid.New()
	variants := []model.Variant{
		{TestID: testID, WorkspaceID: workspaceID, VariantKey: "control", Weight: 33},
		{TestID: testID, WorkspaceID: workspaceID, VariantKey: "v1", Weight: 33},
		{TestID: testID, WorkspaceID: workspaceID, VariantKey: "v2", Weight: 34},
	}

	makeAssigner := func() *Assigner {
		st := store.NewInMemoryStore()
		t0 := model.Test{
			TestID:          testID,
			WorkspaceID:     workspaceID,
			Name:            "test",
			Status:          model.StatusRunning,
			HashBasis:       model.HashBasisWorkspace,
			HashSalt:        salt,
			ExposureEvent:   "view",
			ConversionEvent: "session_ended",
			MinSampleSize:   100,
			AlphaBudget:     0.05,
		}
		t0, err := st.CreateTest(ctx, t0)
		require.NoError(t, err)
		for i := range variants {
			variants[i].TestID = t0.TestID
			variants[i], err = st.CreateVariant(ctx, variants[i])
			require.NoError(t, err)
		}
		return New(st, nil)
	}

	for _, viewer := range []string{"v1", "v2", "v3", "v4", "v5"} {
		a := makeAssigner()
		b := makeAssigner()
		ra, err := a.Assign(ctx, workspaceID, testID, viewer)
		require.NoError(t, err)
		rb, err := b.Assign(ctx, workspaceID, testID, viewer)
		require.NoError(t, err)
		assert.Equal(t, ra.VariantKey, rb.VariantKey, "viewer=%s", viewer)
		assert.Equal(t, ra.Bucket, rb.Bucket)
		_ = result{}
	}
}