package stats

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestMannWhitneyKnownValues — textbook example with expected U and
// reference p-value.
//
// Sample A = {3, 5, 7, 9, 11}, nA=5
// Sample B = {2, 4, 6, 8, 10, 12}, nB=6
//
// Combined sorted: 2,3,4,5,6,7,8,9,10,11,12
// Ranks (all unique): 1,2,3,4,5,6,7,8,9,10,11
// Rank sum A = 2+4+6+8+10 = 30
// U_A = 30 − 5*6/2 = 30 − 15 = 15
// U_B = 5*6 − 15 = 15
// U = min = 15
// μ = 15 (since nA=5, nB=6, μ = nA*nB/2 = 15)
//
// u == μ, so the test reports p ≈ 1.0 (cannot reject H0 — the
// samples are interleaved in a way that produces identical rank
// distributions).
func TestMannWhitneyKnownValues(t *testing.T) {
	t.Parallel()
	a := []float64{3, 5, 7, 9, 11}
	b := []float64{2, 4, 6, 8, 10, 12}
	r, err := MannWhitneyU(a, b)
	require.NoError(t, err)
	assert.InDelta(t, 15.0, r.UStatistic, 0.5, "U statistic")
	assert.Greater(t, r.PValue, 0.9, "u ≈ μ → p near 1.0")
}

// TestMannWhitneyNoDifference — when both samples are identical the
// U statistic is nA*nB/2 and the p-value is high (we fail to reject H0).
func TestMannWhitneyNoDifference(t *testing.T) {
	t.Parallel()
	a := []float64{1, 2, 3, 4, 5}
	b := []float64{1, 2, 3, 4, 5}
	r, err := MannWhitneyU(a, b)
	require.NoError(t, err)
	assert.InDelta(t, 12.5, r.UStatistic, 1.0, "U = nA*nB/2 = 12.5")
	assert.Greater(t, r.PValue, 0.5, "no real difference → high p-value")
}

// TestMannWhitneyCompleteShift — when every element of B exceeds
// every element of A, U = 0 (extreme statistic).
func TestMannWhitneyCompleteShift(t *testing.T) {
	t.Parallel()
	a := []float64{1, 2, 3, 4, 5}
	b := []float64{10, 20, 30, 40, 50}
	r, err := MannWhitneyU(a, b)
	require.NoError(t, err)
	assert.Equal(t, 0.0, r.UStatistic)
	assert.Less(t, r.PValue, 0.05, "extreme separation → small p")
	assert.Greater(t, r.EffectSigned, 0.0)
}

// TestMannWhitneyTies — when ties exist the variance is corrected
// downward. Verify that the corrected U and p still lie in valid ranges.
func TestMannWhitneyTies(t *testing.T) {
	t.Parallel()
	a := []float64{1, 2, 2, 3, 4}
	b := []float64{1, 1, 2, 3, 5}
	r, err := MannWhitneyU(a, b)
	require.NoError(t, err)
	// Combined: 1,1,1,2,2,2,3,3,4,5
	// Ranks: 2,2,2,5,5,5,7.5,7.5,9,10 (midrank for ties)
	// U must be in [0, nA*nB] = [0, 25].
	assert.GreaterOrEqual(t, r.UStatistic, 0.0)
	assert.LessOrEqual(t, r.UStatistic, float64(len(a)*len(b)))
	assert.GreaterOrEqual(t, r.PValue, 0.0)
	assert.LessOrEqual(t, r.PValue, 1.0)
}

// TestMannWhitneyLarge — at large n a real effect should produce a
// very small p-value.
func TestMannWhitneyLarge(t *testing.T) {
	t.Parallel()
	n := 200
	// Shifted means: A from {0..99}, B from {100..299}.
	a := make([]float64, n)
	b := make([]float64, n)
	for i := 0; i < n; i++ {
		a[i] = float64(i)
		b[i] = float64(i + 100)
	}
	r, err := MannWhitneyU(a, b)
	require.NoError(t, err)
	assert.Less(t, r.PValue, 1e-10, "extreme separation at large n should give tiny p")
	assert.Greater(t, r.EffectSigned, 0.0)
}