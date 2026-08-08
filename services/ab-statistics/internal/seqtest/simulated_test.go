package seqtest

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type simulatedCase struct {
	name     string
	pA       float64
	pB       float64
	minSize  int
	expected Action
	atMostN  int // expected stop_n ≤ atMostN
}

// TestEarlyStoppingOnSimulatedEffect runs a stream of synthetic
// observations and feeds them through the mSPRT checkpoint at every
// step. The point is to verify:
//
//   1. A clearly positive effect triggers stop_for_winner earlier than
//      the full sample size.
//   2. A clearly negative effect triggers stop_for_futility.
//   3. A no-effect stream does not trigger either stop.
//
// The synthetic stream is deterministic — we hard-code the conversion
// rates so the test does not depend on an RNG.
func TestEarlyStoppingOnSimulatedEffect(t *testing.T) {
	cases := []simulatedCase{
		{
			name:     "strong positive lift",
			pA:       0.05,
			pB:       0.10,
			minSize:  500,
			expected: ActionStopForWinner,
			atMostN:  3000,
		},
		{
			name:     "strong negative lift",
			pA:       0.10,
			pB:       0.05,
			minSize:  500,
			expected: ActionStopForFutility,
			atMostN:  3000,
		},
		{
			name:     "no effect continues",
			pA:       0.05,
			pB:       0.05,
			minSize:  500,
			expected: ActionContinue,
			atMostN:  5000,
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			ResetRNG(nameSeed(c.name))
			cfg := DefaultConfig()
			cfg.MinSampleSize = c.minSize

			stopped := false
			for n := 100; n <= c.atMostN; n += 100 {
				nA := n / 2
				nB := n - nA
				kA := int(float64(nA) * c.pA)
				kB := int(float64(nB) * c.pB)
				dec, err := Evaluate(cfg, nA, kA, nB, kB)
				require.NoError(t, err)
				if dec.Action != ActionContinue {
					assert.Equal(t, c.expected, dec.Action, "stop at n=%d", n)
					stopped = true
					break
				}
			}
			if c.expected == ActionContinue {
				assert.False(t, stopped, "no-effect run should keep going")
			} else {
				assert.True(t, stopped, "expected a stop by n=%d", c.atMostN)
			}
		})
	}
}

// nameSeed produces a deterministic seed from the test case name.
func nameSeed(name string) uint64 {
	var s uint64 = 0xc0ffee
	for i := 0; i < len(name); i++ {
		s = s*131 + uint64(name[i])
	}
	return s
}