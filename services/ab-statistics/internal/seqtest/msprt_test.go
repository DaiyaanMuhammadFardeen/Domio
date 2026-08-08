package seqtest

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestEvaluateBelowMinSample(t *testing.T) {
	ResetRNG(42)
	cfg := DefaultConfig()
	// 100 exposures each, big effect — should still continue because
	// we're below min_sample_size.
	dec, err := Evaluate(cfg, 100, 5, 100, 20)
	require.NoError(t, err)
	assert.Equal(t, ActionContinue, dec.Action)
}

func TestEvaluateWinner(t *testing.T) {
	ResetRNG(42)
	cfg := DefaultConfig()
	cfg.MinSampleSize = 100
	dec, err := Evaluate(cfg, 5000, 500, 5000, 800)
	require.NoError(t, err)
	assert.Equal(t, ActionStopForWinner, dec.Action, "expected early stop for winner with strong lift")
}

func TestEvaluateFutility(t *testing.T) {
	ResetRNG(42)
	cfg := DefaultConfig()
	cfg.MinSampleSize = 100
	// Identical arms — posterior probability of b beating a should
	// converge to 0.5 which is *above* the futility threshold, so this
	// continues; we instead exercise the futility branch with a tiny
	// negative trend.
	dec, err := Evaluate(cfg, 5000, 500, 5000, 200)
	require.NoError(t, err)
	// With kA=500 and kB=200 over 5000 each, kB has far fewer
	// conversions; P(b > a) is well below 0.05 → futility stop.
	assert.Equal(t, ActionStopForFutility, dec.Action)
}

func TestEvaluateContinue(t *testing.T) {
	ResetRNG(42)
	cfg := DefaultConfig()
	cfg.MinSampleSize = 5000
	// Below min_sample_size, must continue regardless of effect.
	dec, err := Evaluate(cfg, 1500, 150, 1500, 200)
	require.NoError(t, err)
	assert.Equal(t, ActionContinue, dec.Action)
}

func TestEvaluateInvalidConfig(t *testing.T) {
	cfg := DefaultConfig()
	cfg.AlphaBudget = 0
	_, err := Evaluate(cfg, 100, 10, 100, 20)
	assert.Error(t, err)
	cfg.AlphaBudget = 0.05
	_, err = Evaluate(cfg, 0, 0, 100, 50)
	assert.Error(t, err)
	_, err = Evaluate(cfg, 100, 200, 100, 50)
	assert.Error(t, err)
}

func TestEvaluateAlphaSpending(t *testing.T) {
	ResetRNG(42)
	cfg := DefaultConfig()
	cfg.MinSampleSize = 1000

	// n = 1000 (start): α_eff = 0.05
	d1, err := Evaluate(cfg, 500, 50, 500, 50)
	require.NoError(t, err)
	assert.InDelta(t, 0.05, d1.AlphaSpent, 0.001)

	// n = 4000: α_eff = 0.05 * √4 = 0.10 → clamped to 0.05
	d2, err := Evaluate(cfg, 2000, 200, 2000, 220)
	require.NoError(t, err)
	assert.InDelta(t, 0.05, d2.AlphaSpent, 0.001)
}