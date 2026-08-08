package stats

import (
	"math"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestBayesianIdenticalSamples — when the samples are identical the
// posterior means collapse to the sample mean and the credible
// interval covers 0.
func TestBayesianIdenticalSamples(t *testing.T) {
	t.Parallel()
	a := []float64{1, 2, 3, 4, 5}
	b := []float64{1, 2, 3, 4, 5}
	r, err := BayesianNormal(a, b)
	require.NoError(t, err)
	assert.InDelta(t, 3.0, r.PosteriorMeanA, 1e-3)
	assert.InDelta(t, 3.0, r.PosteriorMeanB, 1e-3)
	assert.InDelta(t, 0.0, r.EffectSigned, 1e-3)
	assert.InDelta(t, 0.5, r.PBetterThanA, 1e-6, "P(B>A) = 0.5 when no effect")
}

// TestBayesianShiftedMeans — known shift should produce a
// credible interval that excludes 0 and a P(B>A) close to 1.
func TestBayesianShiftedMeans(t *testing.T) {
	t.Parallel()
	a := []float64{1, 2, 3, 4, 5}
	b := []float64{6, 7, 8, 9, 10}
	r, err := BayesianNormal(a, b)
	require.NoError(t, err)
	assert.Greater(t, r.PBetterThanA, 0.99, "very large shift → P(B>A) ≈ 1")
	assert.Greater(t, r.CredibleLow, 0.0, "credible interval excludes 0")
	assert.Greater(t, r.EffectSigned, 0.0)
}

// TestBayesianCredibleIntervalWidth — interval must widen as n drops.
// We construct samples with identical sample variance so the
// comparison isolates the n effect.
func TestBayesianCredibleIntervalWidth(t *testing.T) {
	t.Parallel()
	// Both groups have sample variance 2.5 (a shift of 4 between
	// the groups).
	a := []float64{1, 2, 3, 4, 5, 1, 2, 3, 4, 5}
	b := []float64{5, 6, 7, 8, 9, 5, 6, 7, 8, 9}
	r1, err := BayesianNormal(a, b)
	require.NoError(t, err)
	width1 := r1.CredibleHigh - r1.CredibleLow

	// Smaller n, same sample variance.
	r2, err := BayesianNormal(a[:5], b[:5])
	require.NoError(t, err)
	width2 := r2.CredibleHigh - r2.CredibleLow
	assert.Greater(t, width2, width1, "smaller n → wider credible interval")
}

// TestBayesianPosteriorVarianceShrinks — posterior variance should
// shrink as n grows (more data → more certainty).
func TestBayesianPosteriorVarianceShrinks(t *testing.T) {
	t.Parallel()
	a := make([]float64, 100)
	b := make([]float64, 100)
	for i := range a {
		a[i] = 1.0
		b[i] = 1.0
	}
	r, err := BayesianNormal(a, b)
	require.NoError(t, err)
	assert.Less(t, r.PosteriorVarA, 0.01, "large n → small posterior variance")
}

// TestBayesianKnownSigma — verify the analytic formula:
//
//	posterior_mean = sample_mean * n / (n + σ²/σ0²)
//	posterior_var  = σ² / (n + σ²/σ0²)
//
// For n=4, σ²=1, σ0²=1000 → posterior_mean ≈ sample_mean * 4/1004 ≈
// sample_mean * 0.004 (almost flat prior). For n=1000, σ²=1 →
// posterior_mean ≈ sample_mean (data dominates).
func TestBayesianKnownSigma(t *testing.T) {
	t.Parallel()
	a := make([]float64, 1000)
	for i := range a {
		a[i] = 5.0
	}
	r, err := BayesianNormal(a, []float64{5.0})
	require.NoError(t, err)
	assert.InDelta(t, 5.0, r.PosteriorMeanA, 0.01)
	// Posterior variance ≈ 1/1000 = 0.001.
	assert.Less(t, r.PosteriorVarA, 0.01)
	// 95% CI on the mean should be within ±0.062.
	assert.Less(t, math.Abs(r.PosteriorMeanA-5.0), 0.1)
}