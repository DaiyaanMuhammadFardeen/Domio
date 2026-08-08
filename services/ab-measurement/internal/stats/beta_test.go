package stats

import (
	"math"
	"math/rand"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBetaPosteriorMean(t *testing.T) {
	p := NewBetaPosterior(200, 100)
	assert.InDelta(t, 0.495, p.Mean(), 0.01)
}

func TestBetaPosteriorSampleRange(t *testing.T) {
	p := NewBetaPosterior(1000, 500)
	r := rand.New(rand.NewSource(42))
	for i := 0; i < 1_000; i++ {
		s := p.Sample(r)
		assert.GreaterOrEqual(t, s, 0.0)
		assert.Less(t, s, 1.0)
	}
}

func TestBetaBinomialLiftDirection(t *testing.T) {
	res, err := BetaBinomialLift(1000, 100, 1000, 130, 20_000, 42)
	require.NoError(t, err)
	assert.Greater(t, res.MeanLift, 0.02)
	assert.Less(t, res.MeanLift, 0.04)
	assert.Greater(t, res.ProbBBeatsA, 0.95)
	assert.Less(t, res.CILow, 0.03)
	assert.Greater(t, res.CIHigh, 0.03)
}

func TestBetaBinomialLiftEqualArms(t *testing.T) {
	res, err := BetaBinomialLift(5000, 250, 5000, 250, 20_000, 42)
	require.NoError(t, err)
	assert.InDelta(t, 0.0, res.MeanLift, 0.01)
	assert.InDelta(t, 0.5, res.ProbBBeatsA, 0.02)
}

func TestBetaBinomialLiftInvalidCounts(t *testing.T) {
	_, err := BetaBinomialLift(0, 0, 100, 50, 1000, 42)
	assert.Error(t, err)
	_, err = BetaBinomialLift(100, 200, 100, 50, 1000, 42)
	assert.Error(t, err)
}

func TestZTestBasic(t *testing.T) {
	res, err := TwoProportionZTest(1000, 100, 1000, 130)
	require.NoError(t, err)
	assert.InDelta(t, 0.03, res.Lift, 1e-9)
	assert.Greater(t, res.Z, 1.9)
	assert.Less(t, res.PValue, 0.05)
}

func TestZTestEqualArms(t *testing.T) {
	res, err := TwoProportionZTest(1000, 100, 1000, 100)
	require.NoError(t, err)
	assert.InDelta(t, 0.0, res.Lift, 1e-9)
	assert.InDelta(t, 0.0, res.Z, 1e-9)
	assert.InDelta(t, 0.5, 1-normCDF(res.Z), 1e-9)
	assert.InDelta(t, 1.0, res.PValue, 1e-9)
}

func TestZTestInvalidSampleSize(t *testing.T) {
	_, err := TwoProportionZTest(0, 0, 100, 50)
	assert.Error(t, err)
}

func TestZTestInvalidCounts(t *testing.T) {
	_, err := TwoProportionZTest(100, 200, 100, 50)
	assert.Error(t, err)
}

func TestZTestCIRange(t *testing.T) {
	res, err := TwoProportionZTest(500, 50, 500, 80)
	require.NoError(t, err)
	assert.Less(t, res.CILow, res.Lift)
	assert.Greater(t, res.CIHigh, res.Lift)
}

func TestNormCDFZero(t *testing.T) {
	assert.InDelta(t, 0.5, normCDF(0), 1e-12)
}

func TestNormCDFFarRight(t *testing.T) {
	assert.Greater(t, normCDF(3.0), 0.998)
}

func TestGammaSample(t *testing.T) {
	r := rand.New(rand.NewSource(7))
	samples := make([]float64, 100_000)
	sum := 0.0
	for i := range samples {
		x := gammaSample(r, 2.0)
		samples[i] = x
		sum += x
	}
	mean := sum / float64(len(samples))
	assert.InDelta(t, 2.0, mean, 0.05, "gamma mean")

	var sq float64
	for _, v := range samples {
		sq += (v - mean) * (v - mean)
	}
	variance := sq / float64(len(samples))
	assert.InDelta(t, 2.0, variance, 0.1, "gamma variance")
	_ = math.Abs
}