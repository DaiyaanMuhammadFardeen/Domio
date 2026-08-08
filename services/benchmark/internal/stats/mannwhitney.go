package stats

import (
	"math"
	"sort"

	"github.com/domio/platform/services/benchmark/internal/model"
)

// MannWhitneyResult is the output of MannWhitneyU.
type MannWhitneyResult struct {
	UStatistic    float64 `json:"u_statistic"`
	ZStatistic    float64 `json:"z_statistic"`
	PValue        float64 `json:"p_value"`
	MeanA         float64 `json:"mean_a"`
	MeanB         float64 `json:"mean_b"`
	NA            int     `json:"n_a"`
	NB            int     `json:"n_b"`
	EffectSigned  float64 `json:"effect_signed"`
}

// MannWhitneyU performs the Mann-Whitney U test (also called
// Wilcoxon rank-sum). We use the standard normal approximation with
// tie correction and a continuity correction of 0.5 for samples of
// size > 20 (the exact permutation distribution is O(n!) and
// prohibitive for large n; the normal approximation is adequate for
// the benchmark service's typical sample sizes).
//
// Tie handling: when multiple observations share the same value, they
// are assigned the midrank (the average of the ranks they would have
// received). The variance correction subtracts
//   Σ (t³ − t) / 12
// where t is the tie count at each tied value.
func MannWhitneyU(a, b []float64) (model.InferenceResult, error) {
	if len(a) == 0 || len(b) == 0 {
		return model.InferenceResult{}, ErrInsufficientSamples
	}
	nA := len(a)
	nB := len(b)
	meanA := meanOnly(a)
	meanB := meanOnly(b)

	// Combine, sort, and compute ranks with midrank for ties.
	type pair struct {
		val   float64
		group int // 0 = a, 1 = b
	}
	combined := make([]pair, 0, nA+nB)
	for _, v := range a {
		combined = append(combined, pair{v, 0})
	}
	for _, v := range b {
		combined = append(combined, pair{v, 1})
	}
	sort.SliceStable(combined, func(i, j int) bool {
		return combined[i].val < combined[j].val
	})
	ranks := make([]float64, len(combined))
	tieCounts := map[float64]int{}
	for i, p := range combined {
		_ = i
		_ = p
	}
	// Walk and assign midranks.
	i := 0
	for i < len(combined) {
		j := i
		for j < len(combined) && combined[j].val == combined[i].val {
			j++
		}
		// ranks[i..j-1] = (i+1 + j) / 2 (midrank, 1-indexed).
		mid := float64(i+1+j) / 2
		for k := i; k < j; k++ {
			ranks[k] = mid
		}
		tieCounts[combined[i].val] = j - i
		i = j
	}

	// Sum ranks for group A.
	var rankSumA float64
	for idx, p := range combined {
		if p.group == 0 {
			rankSumA += ranks[idx]
		}
	}
	// U = R_A − nA(nA+1)/2.
	uA := rankSumA - float64(nA*(nA+1))/2
	uB := float64(nA*nB) - uA
	u := uA
	if uB < uA {
		u = uB
	}

	// Mean and variance under H0.
	mu := float64(nA*nB) / 2
	var tieSum float64
	for _, t := range tieCounts {
		if t > 1 {
			tieSum += float64(t*t*t - t)
		}
	}
	N := float64(nA + nB)
	variance := float64(nA*nB) / 12 * ((N + 1) - tieSum/(N*(N-1)))

	// Continuity correction of 0.5 (Mann-Whitney convention). When
	// the difference |U − μ| is smaller than 0.5 we clamp z to 0
	// so the two-sided p-value is 1.0 (cannot reject).
	diff := math.Abs(u-mu) - 0.5
	if diff < 0 {
		diff = 0
	}
	z := diff / math.Sqrt(variance)
	p := 2 * (1 - normalCDF(z))
	if p < 0 {
		p = 0
	}
	if p > 1 {
		p = 1
	}
	return model.InferenceResult{
		Method:       model.MethodMannWhitney,
		UStatistic:   u,
		PValue:       p,
		MeanA:        meanA,
		MeanB:        meanB,
		NA:           nA,
		NB:           nB,
		EffectSigned: meanB - meanA,
	}, nil
}

// meanOnly returns the arithmetic mean of x without a variance
// calculation (kept here for symmetry with meanVar in welch.go).
func meanOnly(x []float64) float64 {
	n := float64(len(x))
	if n == 0 {
		return 0
	}
	sum := 0.0
	for _, v := range x {
		sum += v
	}
	return sum / n
}

// normalCDF returns the standard normal CDF at x using math.Erf.
func normalCDF(x float64) float64 {
	return 0.5 * (1 + math.Erf(x/math.Sqrt2))
}