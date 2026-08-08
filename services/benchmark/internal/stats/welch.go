// Package stats implements the frequentist + Bayesian statistics used
// by the benchmark service. All three inference methods (Welch's
// t-test, Mann-Whitney U, Bayesian normal-normal) are implemented
// from scratch — no third-party stat library — so the test surface
// is small and the behaviour is reproducible.
//
// welch.go — Welch's t-test for two samples with potentially
// unequal variances. Returns the t-statistic, the Welch-Satterthwaite
// degrees of freedom, and the two-sided p-value derived from the
// t-distribution CDF.
package stats

import (
	"errors"
	"math"

	"github.com/domio/platform/services/benchmark/internal/model"
)

// ErrInsufficientSamples — both samples must have at least 1 element.
var ErrInsufficientSamples = errors.New("stats: need at least one sample in each group")

// ErrZeroVariance — both samples are constant. The Welch denominator
// becomes zero and the test is undefined; callers should fall back to
// the effect direction in EffectSigned.
var ErrZeroVariance = errors.New("stats: zero variance in both samples")

// WelchResult is the output of WelchT. Field names mirror the model
// fields exposed in the public BenchmarkRun response.
type WelchResult struct {
	TStatistic       float64 `json:"t_statistic"`
	DegreesOfFreedom float64 `json:"degrees_of_freedom"`
	PValue           float64 `json:"p_value"`
	MeanA            float64 `json:"mean_a"`
	MeanB            float64 `json:"mean_b"`
	VarA             float64 `json:"var_a"`
	VarB             float64 `json:"var_b"`
	NA               int     `json:"n_a"`
	NB               int     `json:"n_b"`
	EffectSigned     float64 `json:"effect_signed"`
}

// WelchT performs Welch's two-sample t-test on a and b.
//
// The t-statistic is
//
//	t = (meanA − meanB) / sqrt(varA/nA + varB/nB)
//
// and the degrees of freedom use the Welch-Satterthwaite formula:
//
//	df = (varA/nA + varB/nB)^2 / ( (varA/nA)^2/(nA−1) + (varB/nB)^2/(nB−1) )
//
// The p-value is two-sided. The implementation uses the incomplete
// beta function approximation to compute the t-CDF (lentz continued
// fraction), avoiding a hard dependency on gonum.
func WelchT(a, b []float64) (model.InferenceResult, error) {
	if len(a) == 0 || len(b) == 0 {
		return model.InferenceResult{}, ErrInsufficientSamples
	}
	meanA, varA := meanVar(a)
	meanB, varB := meanVar(b)
	nA := float64(len(a))
	nB := float64(len(b))
	denom := math.Sqrt(varA/nA + varB/nB)
	if denom == 0 {
		return model.InferenceResult{
			Method:    model.MethodWelchT,
			MeanA:     meanA,
			MeanB:     meanB,
			VarA:      varA,
			VarB:      varB,
			NA:        len(a),
			NB:        len(b),
			PValue:    1,
			EffectSigned: meanB - meanA,
		}, ErrZeroVariance
	}
	t := (meanA - meanB) / denom
	// Welch-Satterthwaite df.
	// Guard: when nA=1 (or nB=1) the (nA-1) term is zero and the
	// formula degenerates to 0/0 = NaN. Fall back to the simple
	// pooled df in that case.
	var df float64
	if nA <= 1 || nB <= 1 {
		df = math.Max(nA-1, nB-1)
		if df <= 0 {
			df = 1
		}
	} else {
		num := math.Pow(varA/nA+varB/nB, 2)
		den := math.Pow(varA/nA, 2)/(nA-1) + math.Pow(varB/nB, 2)/(nB-1)
		df = num / den
		if df <= 0 || math.IsNaN(df) {
			df = math.Max(nA-1, nB-1)
		}
	}
	p := 2 * (1 - studentTCDF(math.Abs(t), df))
	if p < 0 {
		p = 0
	}
	if p > 1 {
		p = 1
	}
	return model.InferenceResult{
		Method:        model.MethodWelchT,
		TStatistic:    t,
		DegreesOfFreedom: df,
		PValue:        p,
		MeanA:         meanA,
		MeanB:         meanB,
		VarA:          varA,
		VarB:          varB,
		NA:            len(a),
		NB:            len(b),
		EffectSigned:  meanB - meanA,
	}, nil
}

// meanVar returns the sample mean and sample variance (with
// Bessel's correction: denominator n−1).
func meanVar(x []float64) (mean, variance float64) {
	n := float64(len(x))
	if n == 0 {
		return 0, 0
	}
	sum := 0.0
	for _, v := range x {
		sum += v
	}
	mean = sum / n
	ss := 0.0
	for _, v := range x {
		d := v - mean
		ss += d * d
	}
	if n > 1 {
		variance = ss / (n - 1)
	}
	return mean, variance
}

// studentTCDF returns the cumulative distribution function of
// Student's t with df degrees of freedom at x. Implementation:
//
//	CDF(x) = 1 − 0.5 * I_x(t), where
//	  t = df / (x^2 + df)
//	I_x(t) = regularised incomplete beta function
//
// The incomplete beta is computed via a continued fraction (Lentz's
// method, Numerical Recipes §6.4). Accurate to ~1e-12 for the ranges
// the benchmark service uses (df ≥ 1, |x| ≤ 1e6).
func studentTCDF(x, df float64) float64 {
	if x == 0 {
		return 0.5
	}
	if math.IsInf(x, 1) {
		return 1
	}
	if math.IsInf(x, -1) {
		return 0
	}
	// CDF(t, df) = 1 - 0.5 * I_x(t), with t = df/(x^2+df).
	t := df / (x*x + df)
	inc := incBeta(t, df/2, 0.5)
	// For x > 0: CDF = 1 - 0.5 * I_x. For x < 0: CDF = 0.5 * I_x.
	if x > 0 {
		return 1 - 0.5*inc
	}
	return 0.5 * inc
}

// incBeta returns the regularised incomplete beta function I_x(a, b).
//
// I_x(a, b) = B(x; a, b) / B(a, b) — the CDF of the Beta(a, b)
// distribution evaluated at x. We use the continued fraction from
// Numerical Recipes §6.4.3 (Lentz's method) for the case x < (a+1)/(a+b+2)
// after a reflection when x is large.
func incBeta(x, a, b float64) float64 {
	if x <= 0 {
		return 0
	}
	if x >= 1 {
		return 1
	}
	// Lentz continued fraction, NR §6.4.5.
	// bt = exp(lgamma(a+b) - lgamma(a) - lgamma(b) + a*log(x) + b*log(1-x))
	// For x < (a+1)/(a+b+2): I_x(a,b) = bt * cf(a, b, x) / a
	// For x >= (a+1)/(a+b+2): I_x(a,b) = 1 - bt * cf(b, a, 1-x) / b
	lbeta := logBeta(a, b)
	front := math.Exp(a*math.Log(x) + b*math.Log(1-x) - lbeta)
	if x < (a+1)/(a+b+2) {
		return front * cfBeta(x, a, b) / a
	}
	// Symmetric reflection.
	front2 := math.Exp(b*math.Log(1-x) + a*math.Log(x) - lbeta)
	_ = front
	return 1 - front2*cfBeta(1-x, b, a)/b
}

// cfBeta is the Lentz continued fraction for the regularised
// incomplete beta function (NR §6.4.5).
func cfBeta(x, a, b float64) float64 {
	c := 1.0
	d := 1.0 - (a+b)*x/(a+1)
	if math.Abs(d) < 1e-300 {
		d = 1e-300
	}
	d = 1 / d
	result := d
	for m := 1; m <= 200; m++ {
		mf := float64(m)
		// Even step.
		aa := mf * (b - mf) * x / ((a + 2*mf - 1) * (a + 2*mf))
		d = 1 + aa*d
		if math.Abs(d) < 1e-300 {
			d = 1e-300
		}
		c = 1 + aa/c
		if math.Abs(c) < 1e-300 {
			c = 1e-300
		}
		d = 1 / d
		// Odd step.
		aa = -(a + mf) * (a + b + mf) * x / ((a + 2*mf) * (a + 2*mf + 1))
		d = 1 + aa*d
		if math.Abs(d) < 1e-300 {
			d = 1e-300
		}
		c = 1 + aa/c
		if math.Abs(c) < 1e-300 {
			c = 1e-300
		}
		d = 1 / d
		delta := d * c
		result *= delta
		if math.Abs(delta-1) < 1e-12 {
			break
		}
	}
	return result
}

// logBeta is the log of the Beta function: log B(a, b) = lgamma(a) +
// lgamma(b) − lgamma(a+b). lgamma is the Lanczos approximation.
func logBeta(a, b float64) float64 {
	return logGamma(a) + logGamma(b) - logGamma(a+b)
}

// logGamma — Lanczos approximation (g=7, n=9 coefficients).
func logGamma(z float64) float64 {
	if z < 0.5 {
		// Reflection formula.
		return math.Log(math.Pi/math.Sin(math.Pi*z)) - logGamma(1-z)
	}
	z -= 1
	p := 0.99999999999980993
	coeffs := []float64{
		676.5203681218851,
		-1259.1392167224028,
		771.32342877765313,
		-176.61502916214059,
		12.507343278686905,
		-0.13857109526572012,
		9.9843695780195716e-6,
		1.5056327351493116e-7,
	}
	for i, c := range coeffs {
		p += c / (z + float64(i+1))
	}
	t := z + 7.5
	return 0.5*math.Log(2*math.Pi) + (z+0.5)*math.Log(t) - t + math.Log(p)
}