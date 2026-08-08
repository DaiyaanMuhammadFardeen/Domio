package inference

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/domio/platform/services/benchmark/internal/model"
)

func TestInferDispatchesWelchT(t *testing.T) {
	t.Parallel()
	r, err := Infer([]float64{1, 2, 3, 4, 5}, []float64{3, 4, 5, 6, 7}, model.MethodWelchT)
	require.NoError(t, err)
	assert.Equal(t, model.MethodWelchT, r.Method)
	assert.Equal(t, 5, r.NA)
	assert.Equal(t, 5, r.NB)
}

func TestInferDispatchesMannWhitney(t *testing.T) {
	t.Parallel()
	r, err := Infer([]float64{1, 2, 3, 4, 5}, []float64{3, 4, 5, 6, 7}, model.MethodMannWhitney)
	require.NoError(t, err)
	assert.Equal(t, model.MethodMannWhitney, r.Method)
	assert.Equal(t, 5, r.NA)
}

func TestInferDispatchesBayesian(t *testing.T) {
	t.Parallel()
	r, err := Infer([]float64{1, 2, 3, 4, 5}, []float64{3, 4, 5, 6, 7}, model.MethodBayesianNormal)
	require.NoError(t, err)
	assert.Equal(t, model.MethodBayesianNormal, r.Method)
	assert.GreaterOrEqual(t, r.PBetterThanA, 0.0)
	assert.LessOrEqual(t, r.PBetterThanA, 1.0)
}

func TestInferEmptyMethodDefaultsToWelch(t *testing.T) {
	t.Parallel()
	r, err := Infer([]float64{1, 2, 3, 4, 5}, []float64{3, 4, 5, 6, 7}, "")
	require.NoError(t, err)
	assert.Equal(t, model.MethodWelchT, r.Method)
}

func TestInferUnknownMethodRejected(t *testing.T) {
	t.Parallel()
	_, err := Infer([]float64{1, 2, 3, 4, 5}, []float64{3, 4, 5, 6, 7}, model.InferenceMethod("z_test"))
	require.Error(t, err)
	assert.True(t, errors.Is(err, ErrUnknownMethod))
}

func TestInferEmptySamplesRejected(t *testing.T) {
	t.Parallel()
	_, err := Infer(nil, []float64{1, 2, 3}, model.MethodWelchT)
	require.Error(t, err)
	assert.True(t, errors.Is(err, ErrInsufficientSamples))
	_, err = Infer([]float64{1, 2, 3}, nil, model.MethodWelchT)
	require.Error(t, err)
	assert.True(t, errors.Is(err, ErrInsufficientSamples))
}

// TestAllThreeMethodsAgreeOnDirection — all three methods must agree
// on the SIGN of the effect (which group has the higher mean) for
// the same data set.
func TestAllThreeMethodsAgreeOnDirection(t *testing.T) {
	t.Parallel()
	// Clear, large separation.
	a := []float64{1, 2, 3, 4, 5, 6, 7, 8, 9, 10}
	b := []float64{11, 12, 13, 14, 15, 16, 17, 18, 19, 20}
	results := make([]model.InferenceResult, 3)
	results[0], _ = Infer(a, b, model.MethodWelchT)
	results[1], _ = Infer(a, b, model.MethodMannWhitney)
	results[2], _ = Infer(a, b, model.MethodBayesianNormal)
	assert.True(t, AgreeOnDirection(results), "all three methods must agree on sign")
	for _, r := range results {
		assert.Greater(t, r.EffectSigned, 0.0, "B > A")
	}
}

// TestAllThreeMethodsAgreeOnReverseDirection — same check with
// b < a.
func TestAllThreeMethodsAgreeOnReverseDirection(t *testing.T) {
	t.Parallel()
	a := []float64{11, 12, 13, 14, 15, 16, 17, 18, 19, 20}
	b := []float64{1, 2, 3, 4, 5, 6, 7, 8, 9, 10}
	results := make([]model.InferenceResult, 3)
	results[0], _ = Infer(a, b, model.MethodWelchT)
	results[1], _ = Infer(a, b, model.MethodMannWhitney)
	results[2], _ = Infer(a, b, model.MethodBayesianNormal)
	assert.True(t, AgreeOnDirection(results))
	for _, r := range results {
		assert.Less(t, r.EffectSigned, 0.0, "B < A")
	}
}

// TestAllThreeMethodsAgreeOnNoDifference — when the means are equal
// the signed effect should round to 0 for all three.
func TestAllThreeMethodsAgreeOnNoDifference(t *testing.T) {
	t.Parallel()
	a := []float64{1, 2, 3, 4, 5}
	b := []float64{1, 2, 3, 4, 5}
	results := make([]model.InferenceResult, 3)
	results[0], _ = Infer(a, b, model.MethodWelchT)
	results[1], _ = Infer(a, b, model.MethodMannWhitney)
	results[2], _ = Infer(a, b, model.MethodBayesianNormal)
	for _, r := range results {
		assert.InDelta(t, 0.0, r.EffectSigned, 1e-9)
	}
}