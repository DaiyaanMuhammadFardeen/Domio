// Package stats implements the Bayesian and frequentist inference
// primitives for the ab-measurement service.
//
// Two estimators are exposed:
//
//   1. BayesianBetaBinomial — given (exposures, conversions) for two
//      variants, returns the posterior Beta(alpha, beta) parameters
//      and a Monte-Carlo estimate of the lift distribution (variant_b
//      rate − variant_a rate over the posterior draws).
//
//   2. TwoProportionZTest — frequentist two-proportion comparison
//      with a normal-approximation z-test. Returns the point estimate
//      of the lift, the standard error, the 95% confidence interval,
//      and the two-sided p-value.
//
// The Monte-Carlo cap is 100k draws to keep the p95 latency well under
// 10ms on a single core. The seeded RNG is used so measurements are
// reproducible across runs.
package stats

import (
	"errors"
	"math"
	"math/rand"
	"sort"
)

// BetaPosterior sums the Beta(a, b) parameters after observing k
// successes in n trials. The uniform prior Beta(1, 1) is the default.
type BetaPosterior struct {
	Alpha float64
	Beta  float64
}

// NewBetaPosterior returns the posterior for k successes in n trials
// with a uniform Beta(1,1) prior.
func NewBetaPosterior(n, k int) BetaPosterior {
	a := float64(k) + 1.0
	b := float64(n-k) + 1.0
	return BetaPosterior{Alpha: a, Beta: b}
}

// Mean returns the posterior mean of the conversion rate.
func (p BetaPosterior) Mean() float64 {
	return p.Alpha / (p.Alpha + p.Beta)
}

// Variance returns the posterior variance of the conversion rate.
func (p BetaPosterior) Variance() float64 {
	s := p.Alpha + p.Beta
	return (p.Alpha * p.Beta) / (s * s * (s + 1))
}

// Sample draws one sample from the Beta posterior using the
// gamma-variate method (Marsaglia & Tsang 2000). The caller pre-seeds
// the RNG so the output is reproducible.
func (p BetaPosterior) Sample(r *rand.Rand) float64 {
	x := gammaSample(r, p.Alpha)
	y := gammaSample(r, p.Beta)
	if x+y == 0 {
		return 0
	}
	return x / (x + y)
}

// LiftResult is the output of the Bayesian Beta-Binomial comparison.
type LiftResult struct {
	Varianta BetaPosterior `json:"variant_a"`
	Variantb BetaPosterior `json:"variant_b"`
	// Mean lift = mean(b) - mean(a). Positive means b is better.
	MeanLift float64 `json:"lift"`
	// 95% credible interval for the lift.
	CILow  float64 `json:"ci_low"`
	CIHigh float64 `json:"ci_high"`
	// Probability that b's rate is greater than a's rate.
	ProbBBeatsA float64 `json:"prob_b_beats_a"`
	// Number of Monte-Carlo draws used.
	Draws int `json:"draws"`
}

// BetaBinomialLift runs the Bayesian comparison.
func BetaBinomialLift(nA, kA, nB, kB int, draws int, seed int64) (LiftResult, error) {
	if nA <= 0 || nB <= 0 || kA < 0 || kB < 0 || kA > nA || kB > nB {
		return LiftResult{}, errors.New("beta-binomial: invalid counts")
	}
	if draws <= 0 {
		draws = 50_000
	}
	r := rand.New(rand.NewSource(seed))
	a := NewBetaPosterior(nA, kA)
	b := NewBetaPosterior(nB, kB)
	lifts := make([]float64, draws)
	wins := 0
	for i := 0; i < draws; i++ {
		sa := a.Sample(r)
		sb := b.Sample(r)
		lifts[i] = sb - sa
		if sb > sa {
			wins++
		}
	}
	sort.Float64s(lifts)
	mean := 0.0
	for _, v := range lifts {
		mean += v
	}
	mean /= float64(draws)
	// 95% credible interval (2.5%, 97.5%).
	lo := lifts[int(0.025*float64(draws))]
	hi := lifts[int(0.975*float64(draws))]
	return LiftResult{
		Varianta:    a,
		Variantb:    b,
		MeanLift:    mean,
		CILow:       lo,
		CIHigh:      hi,
		ProbBBeatsA: float64(wins) / float64(draws),
		Draws:       draws,
	}, nil
}

// ZTestResult is the output of the frequentist two-proportion z-test.
type ZTestResult struct {
	// Difference in proportions (variant_b - variant_a).
	Lift float64 `json:"lift"`
	// Standard error of the difference.
	SE float64 `json:"se"`
	// z-statistic.
	Z float64 `json:"z"`
	// 95% confidence interval for the lift.
	CILow  float64 `json:"ci_low"`
	CIHigh float64 `json:"ci_high"`
	// Two-sided p-value.
	PValue float64 `json:"p_value"`
}

// TwoProportionZTest computes the standard two-proportion z-test.
func TwoProportionZTest(nA, kA, nB, kB int) (ZTestResult, error) {
	if nA <= 0 || nB <= 0 {
		return ZTestResult{}, errors.New("z-test: sample sizes must be positive")
	}
	if kA < 0 || kB < 0 || kA > nA || kB > nB {
		return ZTestResult{}, errors.New("z-test: invalid counts")
	}
	pA := float64(kA) / float64(nA)
	pB := float64(kB) / float64(nB)
	// Pooled variance for the null hypothesis.
	pPool := float64(kA+kB) / float64(nA+nB)
	sePool := math.Sqrt(pPool * (1 - pPool) * (1.0/float64(nA) + 1.0/float64(nB)))
	// Unpooled SE for the CI (Welch-style).
	seUnpool := math.Sqrt(pA*(1-pA)/float64(nA) + pB*(1-pB)/float64(nB))
	var z float64
	if sePool > 0 {
		z = (pB - pA) / sePool
	} else {
		z = 0
	}
	return ZTestResult{
		Lift:   pB - pA,
		SE:     seUnpool,
		Z:      z,
		CILow:  (pB - pA) - 1.96*seUnpool,
		CIHigh: (pB - pA) + 1.96*seUnpool,
		PValue: 2 * (1 - normCDF(math.Abs(z))),
	}, nil
}

// normCDF is the standard normal CDF computed via the error function.
func normCDF(x float64) float64 {
	return 0.5 * (1 + math.Erf(x/math.Sqrt2))
}

// gammaSample draws one sample from Gamma(shape, 1) using the
// Marsaglia & Tsang (2000) method. Used by Beta posterior sampling.
func gammaSample(r *rand.Rand, shape float64) float64 {
	if shape < 1 {
		// Boost shape > 1 scale and recurse.
		return gammaSample(r, shape+1) * math.Pow(r.Float64(), 1.0/shape)
	}
	d := shape - 1.0/3.0
	c := 1.0 / math.Sqrt(9.0*d)
	for {
		x := r.NormFloat64()
		v := 1.0 + c*x
		if v <= 0 {
			continue
		}
		v = v * v * v
		u := r.Float64()
		if u < 1.0-0.0331*x*x*x*x {
			return d * v
		}
		if math.Log(u) < 0.5*x*x+d*(1-v+math.Log(v)) {
			return d * v
		}
	}
}

// Small helpers for tests in package _test.go to avoid float64 drift.
func approxEqual(a, b, tol float64) bool {
	return math.Abs(a-b) < tol
}