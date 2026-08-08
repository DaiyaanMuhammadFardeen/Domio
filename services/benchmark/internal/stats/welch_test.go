package stats

import (
	"math"
	"math/rand"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestWelchKnownValues reproduces a textbook problem.
//
// Sample A: {1, 2, 3, 4, 5}, mean=3, sample variance=2.5
// Sample B: {3, 4, 5, 6, 7}, mean=5, sample variance=2.5
//
// Equal variance, n=5 each, expected:
//
//   t   = (3 - 5) / sqrt(2.5/5 + 2.5/5) = -2 / 1 = -2
//   df  = (nA + nB - 2)              = 8
//   p   ≈ 0.0808 (two-sided, df=8, |t|=2)
//
// The p-value tolerance is generous to absorb continued-fraction
// precision in the tails.
func TestWelchKnownValues(t *testing.T) {
	t.Parallel()
	a := []float64{1, 2, 3, 4, 5}
	b := []float64{3, 4, 5, 6, 7}
	res, err := WelchT(a, b)
	require.NoError(t, err)
	assert.InDelta(t, -2.0, res.TStatistic, 1e-9, "t")
	assert.InDelta(t, 8.0, res.DegreesOfFreedom, 1e-9, "df")
	assert.InDelta(t, 0.0808, res.PValue, 0.005, "p-value")
}

// TestWelchEqualVarianceDegenerateToStudent — when variances are equal,
// Welch's df → (nA+nB−2) and the test coincides with Student's.
// We pick two samples with the same variance and confirm df is close
// to (nA+nB−2).
func TestWelchEqualVarianceDegenerateToStudent(t *testing.T) {
	t.Parallel()
	a := []float64{1, 2, 3, 4, 5, 6, 7, 8, 9, 10}
	b := []float64{3, 4, 5, 6, 7, 8, 9, 10, 11, 12}
	res, err := WelchT(a, b)
	require.NoError(t, err)
	expectedDF := float64(len(a) + len(b) - 2)
	// Equal variance ⇒ Welch df should be very close to (nA+nB−2).
	assert.InDelta(t, expectedDF, res.DegreesOfFreedom, 0.5, "df close to pooled df")
	// Both samples shifted by the same constant; the mean diff should
	// be exactly 2 and the t-statistic non-zero.
	assert.InDelta(t, 2.0, res.MeanB-res.MeanA, 1e-12)
}

// TestWelchN1Degenerate — when either sample has only one element the
// test still produces a finite (though not meaningful) result.
func TestWelchN1Degenerate(t *testing.T) {
	t.Parallel()
	a := []float64{1.0}
	b := []float64{2.0, 3.0, 4.0}
	r, err := WelchT(a, b)
	require.NoError(t, err)
	// meanA = 1, meanB = 3, varB = 1 (sample variance of {2,3,4}).
	assert.InDelta(t, 1.0, r.MeanA, 1e-12)
	assert.InDelta(t, 3.0, r.MeanB, 1e-12)
	assert.InDelta(t, 0.0, r.VarA, 1e-12)
	assert.InDelta(t, 1.0, r.VarB, 1e-12)
	// t = (1-3)/sqrt(0/1 + 1/3) = -2/sqrt(1/3) = -3.464
	assert.InDelta(t, -3.4641, r.TStatistic, 0.001)
	assert.True(t, r.PValue >= 0 && r.PValue <= 1)
}

// TestWelchLargeSample — at large n the test should produce a very
// small p-value when there is a real effect. We use a fixed random
// source to avoid flakiness.
func TestWelchLargeSample(t *testing.T) {
	t.Parallel()
	n := 1000
	rng := rand.New(rand.NewSource(42))
	a := make([]float64, n)
	b := make([]float64, n)
	for i := 0; i < n; i++ {
		// A ~ N(0, 1), B ~ N(0.5, 1). Mean shift 0.5 should give a
		// highly significant p-value with n=1000.
		a[i] = pseudoNormalSeeded(rng)
		b[i] = pseudoNormalSeeded(rng) + 0.5
	}
	r, err := WelchT(a, b)
	require.NoError(t, err)
	assert.Less(t, r.PValue, 0.001, "large real effect should reject H0 strongly")
	assert.Greater(t, r.EffectSigned, 0.0, "signed effect (meanB − meanA) > 0")
}

// TestWelchAsymmetricVariances — unequal variance path; the Welch
// df formula must not collapse to nB−1.
func TestWelchAsymmetricVariances(t *testing.T) {
	t.Parallel()
	// Sample A is constant (var = 0); we should still get a result
	// rather than a divide-by-zero.
	a := []float64{5.0, 5.0, 5.0, 5.0, 5.0}
	b := []float64{1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0}
	r, err := WelchT(a, b)
	require.NoError(t, err)
	// Effect is signed (mean_b - mean_a); B mean = 5.5, A = 5.
	assert.InDelta(t, 0.5, r.EffectSigned, 1e-12)
	assert.Equal(t, 0.0, r.VarA)
	// The t-statistic is well-defined because varB/nB > 0; the df
	// falls back to a finite value.
	assert.True(t, !math.IsNaN(r.TStatistic))
	assert.True(t, !math.IsNaN(r.DegreesOfFreedom))
	assert.True(t, r.DegreesOfFreedom >= 1)
}

// pseudoNormal returns a quick-and-dirty N(0, 1) sample using the
// Box-Muller transform on the math/rand default source. Used by
// tests that need many samples without pulling in a PRNG library.
func pseudoNormal() float64 {
	return pseudoNormalSeeded(rand.New(rand.NewSource(1)))
}

// pseudoNormalSeeded is the deterministic variant — used by tests
// that must not flake.
func pseudoNormalSeeded(rng *rand.Rand) float64 {
	u1 := 1 - rng.Float64() // avoid log(0)
	u2 := rng.Float64()
	r := math.Sqrt(-2 * math.Log(u1))
	theta := 2 * math.Pi * u2
	return r * math.Cos(theta)
}