package stats

import (
	"math"

	"github.com/domio/platform/services/benchmark/internal/model"
)

// BayesianResult is the output of BayesianNormal.
type BayesianResult struct {
	PosteriorMeanA float64 `json:"posterior_mean_a"`
	PosteriorMeanB float64 `json:"posterior_mean_b"`
	PosteriorVarA  float64 `json:"posterior_var_a"`
	PosteriorVarB  float64 `json:"posterior_var_b"`
	CredibleLow    float64 `json:"credible_low"`
	CredibleHigh   float64 `json:"credible_high"`
	PBetterThanA   float64 `json:"p_better_than_a"`
	MeanA          float64 `json:"mean_a"`
	MeanB          float64 `json:"mean_b"`
	NA             int     `json:"n_a"`
	NB             int     `json:"n_b"`
	EffectSigned   float64 `json:"effect_signed"`
}

// BayesianNormal performs Bayesian inference for the difference in
// two normal means with known variance. The conjugate prior is
// N(μ0, σ0²); the posterior on μ given data x with known variance σ²
// is
//
//	μ_post = (μ0/σ0² + sum(x)/σ²) / (1/σ0² + n/σ²)
//	σ²_post = (1/σ0² + n/σ²)^(-1)
//
// We use a flat prior for each group (μ0=0, σ0²=10⁶), so the posterior
// is dominated by the data. The 95% credible interval is μ_post ±
// 1.96 * sqrt(σ²_post). P(B > A) integrates the difference of the
// two normals via the normal CDF.
func BayesianNormal(a, b []float64) (model.InferenceResult, error) {
	if len(a) == 0 || len(b) == 0 {
		return model.InferenceResult{}, ErrInsufficientSamples
	}
	meanA, varA := meanVar(a)
	meanB, varB := meanVar(b)
	nA := len(a)
	nB := len(b)
	priorVar := 1e6
	// Posterior variance for each group.
	posVarA := 1.0 / (1.0/priorVar + float64(nA)/math.Max(varA, 1e-12))
	posVarB := 1.0 / (1.0/priorVar + float64(nB)/math.Max(varB, 1e-12))
	// Posterior mean (assuming a flat prior centred at 0).
	posMeanA := (0.0/float64(priorVar) + meanA*float64(nA)/math.Max(varA, 1e-12)) * posVarA
	posMeanB := (0.0/float64(priorVar) + meanB*float64(nB)/math.Max(varB, 1e-12)) * posVarB

	// 95% credible interval on the difference (μB − μA).
	diff := posMeanB - posMeanA
	diffVar := posVarA + posVarB
	diffSD := math.Sqrt(diffVar)
	low := diff - 1.96*diffSD
	high := diff + 1.96*diffSD

	// P(B > A) under the normal posterior-on-difference.
	pBA := 1 - normalCDF(-diff/diffSD)
	if pBA < 0 {
		pBA = 0
	}
	if pBA > 1 {
		pBA = 1
	}

	return model.InferenceResult{
		Method:        model.MethodBayesianNormal,
		PosteriorMeanA: posMeanA,
		PosteriorMeanB: posMeanB,
		PosteriorVarA:  posVarA,
		PosteriorVarB:  posVarB,
		CredibleLow:    low,
		CredibleHigh:   high,
		PBetterThanA:   pBA,
		MeanA:          meanA,
		MeanB:          meanB,
		NA:             nA,
		NB:             nB,
		EffectSigned:   meanB - meanA,
	}, nil
}