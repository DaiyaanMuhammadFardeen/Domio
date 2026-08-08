package hash

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestComputeBucketDeterminism(t *testing.T) {
	a := ComputeBucket("ws-1", "exp-1", "salt-1", "viewer-1")
	b := ComputeBucket("ws-1", "exp-1", "salt-1", "viewer-1")
	assert.Equal(t, a, b, "same inputs → same bucket")
}

func TestComputeBucketRange(t *testing.T) {
	// Sanity: over 10_000 random (viewer_id) draws, the buckets should
	// all fall in [0, 1).
	for i := 0; i < 10_000; i++ {
		b := ComputeBucket("ws-1", "exp-1", "salt-1", "viewer-"+itoa(i))
		assert.GreaterOrEqual(t, b, 0.0)
		assert.Less(t, b, 1.0)
	}
}

func TestComputeBucketDistribution(t *testing.T) {
	// 100_000 draws: each quintile should hold ~20% ± 5%.
	buckets := make([]int, 5)
	const N = 100_000
	for i := 0; i < N; i++ {
		b := ComputeBucket("ws-1", "exp-1", "salt-1", "viewer-"+itoa(i))
		idx := int(b * 5)
		if idx == 5 {
			idx = 4
		}
		buckets[idx]++
	}
	for i, n := range buckets {
		ratio := float64(n) / float64(N)
		assert.InDelta(t, 0.2, ratio, 0.02, "quintile %d should hold ~20%%", i)
	}
}

func TestAssignDeterminism(t *testing.T) {
	variants := []string{"control", "variant_a"}
	weights := []int{50, 50}
	a, err := Assign("ws-1", "exp-1", "salt-1", "viewer-1", variants, weights, 100)
	require.NoError(t, err)
	b, err := Assign("ws-1", "exp-1", "salt-1", "viewer-1", variants, weights, 100)
	require.NoError(t, err)
	assert.Equal(t, a, b)
}

func TestAssignWorkspaceIsolation(t *testing.T) {
	variants := []string{"a", "b"}
	weights := []int{50, 50}
	a, err := Assign("ws-1", "exp-1", "salt-1", "viewer-1", variants, weights, 100)
	require.NoError(t, err)
	b, err := Assign("ws-2", "exp-1", "salt-1", "viewer-1", variants, weights, 100)
	require.NoError(t, err)
	// Different workspaces should produce different buckets (with very
	// high probability for a single draw). Verify by checking the
	// buckets are not bit-identical — statistically they'll differ.
	notEqual := false
	for i := 0; i < 10; i++ {
		x, _ := Assign("ws-1", "exp-1", "salt-1", "viewer-"+itoa(i), variants, weights, 100)
		y, _ := Assign("ws-2", "exp-1", "salt-1", "viewer-"+itoa(i), variants, weights, 100)
		if x.Bucket != y.Bucket {
			notEqual = true
			break
		}
	}
	assert.True(t, notEqual, "buckets should differ across workspaces for at least one viewer")
	_ = a
	_ = b
}

func TestAssignWeightsProportional(t *testing.T) {
	// 100% to control → every viewer goes to control.
	variants := []string{"control", "variant_a"}
	weights := []int{100, 0}
	for i := 0; i < 1_000; i++ {
		got, err := Assign("ws-1", "exp-1", "salt-1", "viewer-"+itoa(i), variants, weights, 100)
		require.NoError(t, err)
		assert.Equal(t, "control", got.VariantKey)
	}

	// 50/50 split → ~50% control, ~50% variant_a over 10000 viewers.
	cnt := 0
	for i := 0; i < 10_000; i++ {
		got, err := Assign("ws-1", "exp-1", "salt-1", "viewer-"+itoa(i), variants, []int{50, 50}, 100)
		require.NoError(t, err)
		if got.VariantKey == "variant_a" {
			cnt++
		}
	}
	ratio := float64(cnt) / 10_000
	assert.InDelta(t, 0.5, ratio, 0.03)
}

func TestAssignInvalidInputs(t *testing.T) {
	_, err := Assign("ws", "exp", "salt", "v", []string{}, []int{}, 100)
	assert.ErrorIs(t, err, ErrInvalidWeights)
	_, err = Assign("ws", "exp", "salt", "v", []string{"a"}, []int{0}, 100)
	assert.ErrorIs(t, err, ErrInvalidWeights)
	_, err = Assign("ws", "exp", "salt", "v", []string{"a"}, []int{-1}, 100)
	assert.ErrorIs(t, err, ErrInvalidWeights)
}

func TestHashKey(t *testing.T) {
	lo, hi := HashKey("ws-1", "exp-1", "salt-1", "viewer-1")
	assert.NotZero(t, lo|hi)
	// Same inputs → same outputs.
	lo2, hi2 := HashKey("ws-1", "exp-1", "salt-1", "viewer-1")
	assert.Equal(t, lo, lo2)
	assert.Equal(t, hi, hi2)
}

// itoa is a tiny helper that avoids importing strconv for a single use.
func itoa(i int) string {
	if i == 0 {
		return "0"
	}
	var b [16]byte
	pos := len(b)
	for i > 0 {
		pos--
		b[pos] = byte('0' + i%10)
		i /= 10
	}
	return string(b[pos:])
}