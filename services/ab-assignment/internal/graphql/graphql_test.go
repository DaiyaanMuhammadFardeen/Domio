package graphql

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/domio/platform/services/ab-assignment/internal/model"
	"github.com/domio/platform/services/ab-assignment/internal/store"
)

func TestExecuteExperiment(t *testing.T) {
	s := store.NewInMemoryStore()
	ctx := context.Background()
	test := model.Test{
		WorkspaceID: uuid.New(), Name: "demo", Status: model.StatusRunning,
		HashBasis: model.HashBasisWorkspace, ExposureEvent: "view",
		ConversionEvent: "session_ended", MinSampleSize: 100, AlphaBudget: 0.05,
	}
	test, err := s.CreateTest(ctx, test)
	require.NoError(t, err)
	vs := []model.Variant{
		{TestID: test.TestID, WorkspaceID: test.WorkspaceID, VariantKey: "control", Weight: 50, Payload: json.RawMessage(`{"color":"blue"}`)},
		{TestID: test.TestID, WorkspaceID: test.WorkspaceID, VariantKey: "variant_a", Weight: 50, Payload: json.RawMessage(`{"color":"red"}`)},
	}
	for i := range vs {
		vs[i], err = s.CreateVariant(ctx, vs[i])
		require.NoError(t, err)
	}

	sc := New(s)
	res, err := sc.Execute(ctx, QueryRequest{
		OperationName: "Experiment",
		Variables: map[string]interface{}{
			"id":          test.TestID.String(),
			"workspaceId": test.WorkspaceID.String(),
		},
	})
	require.NoError(t, err)
	require.Empty(t, res.Errors, "no GraphQL errors expected")
	require.NotEmpty(t, res.Data)
	var out struct {
		Experiment Experiment `json:"experiment"`
	}
	require.NoError(t, json.Unmarshal(res.Data, &out))
	assert.Equal(t, test.TestID.String(), out.Experiment.ID)
	assert.Equal(t, test.WorkspaceID.String(), out.Experiment.WorkspaceID)
	assert.Equal(t, "demo", out.Experiment.Name)
	assert.Equal(t, "running", out.Experiment.Status)
	assert.Len(t, out.Experiment.Variants, 2)
}

func TestExecuteExperimentResults(t *testing.T) {
	s := store.NewInMemoryStore()
	ctx := context.Background()
	test := model.Test{
		WorkspaceID: uuid.New(), Name: "demo2", Status: model.StatusRunning,
		HashBasis: model.HashBasisWorkspace, ExposureEvent: "view",
		ConversionEvent: "session_ended", MinSampleSize: 100, AlphaBudget: 0.05,
	}
	test, err := s.CreateTest(ctx, test)
	require.NoError(t, err)
	v := model.Variant{TestID: test.TestID, WorkspaceID: test.WorkspaceID, VariantKey: "control", Weight: 100}
	v, err = s.CreateVariant(ctx, v)
	require.NoError(t, err)

	// Record one conversion.
	_, err = s.RecordExposure(ctx, model.ExposureRow{
		WorkspaceID: test.WorkspaceID, TestID: test.TestID,
		ViewerIDKey: "v1", VariantID: v.VariantID,
		ExposureEvent: "session_ended", IsConversion: 1,
	})
	require.NoError(t, err)

	sc := New(s)
	res, err := sc.Execute(ctx, QueryRequest{
		OperationName: "ExperimentResults",
		Variables: map[string]interface{}{
			"id":          test.TestID.String(),
			"workspaceId": test.WorkspaceID.String(),
		},
	})
	require.NoError(t, err)
	require.Empty(t, res.Errors, "no GraphQL errors expected")
	var out struct {
		ExperimentResults json.RawMessage `json:"experimentResults"`
	}
	require.NoError(t, json.Unmarshal(res.Data, &out))
	assert.Contains(t, string(out.ExperimentResults), "control")
	assert.Contains(t, string(out.ExperimentResults), `"conversions":1`)
}

func TestExecuteUnknownOperation(t *testing.T) {
	s := store.NewInMemoryStore()
	sc := New(s)
	_, err := sc.Execute(context.Background(), QueryRequest{OperationName: "Nope"})
	assert.Error(t, err)
}