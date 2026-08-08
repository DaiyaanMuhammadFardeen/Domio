// Package inference is the dispatcher that picks the right statistical
// method for a benchmark and returns a uniform model.InferenceResult.
//
// The three supported methods are:
//
//   welch_t        — Welch's t-test (parametric, unequal variance).
//   mann_whitney   — Mann-Whitney U (non-parametric rank-sum).
//   bayesian_normal — Conjugate normal-normal with known variance.
//
// The dispatcher is deliberately trivial — the value of this package
// is the shared InferenceResult shape and the validation. New
// methods can be added by extending the switch and adding a new
// case in stats/.
package inference

import (
	"errors"

	"github.com/domio/platform/services/benchmark/internal/model"
	"github.com/domio/platform/services/benchmark/internal/stats"
)

// ErrUnknownMethod — the caller asked for a method not in the
// enum (welch_t, mann_whitney, bayesian_normal).
var ErrUnknownMethod = errors.New("inference: unknown method")

// ErrInsufficientSamples — at least one sample is empty.
var ErrInsufficientSamples = errors.New("inference: insufficient samples")

// Infer runs the configured method on a, b. The returned InferenceResult
// always populates MeanA, MeanB, NA, NB, EffectSigned, and Method; the
// method-specific fields are populated according to the chosen test.
func Infer(a, b []float64, method model.InferenceMethod) (model.InferenceResult, error) {
	if len(a) == 0 || len(b) == 0 {
		return model.InferenceResult{}, ErrInsufficientSamples
	}
	switch method {
	case model.MethodWelchT, "":
		// Empty method defaults to Welch's t-test.
		return stats.WelchT(a, b)
	case model.MethodMannWhitney:
		return stats.MannWhitneyU(a, b)
	case model.MethodBayesianNormal:
		return stats.BayesianNormal(a, b)
	default:
		return model.InferenceResult{}, ErrUnknownMethod
	}
}

// AgreeOnDirection returns true if all three methods reach the same
// conclusion about the sign of the effect (b > a, b < a, or b == a).
// Used by the integration test to assert the three tests are
// self-consistent.
func AgreeOnDirection(results []model.InferenceResult) bool {
	if len(results) == 0 {
		return true
	}
	sign := func(x float64) int {
		switch {
		case x > 0:
			return 1
		case x < 0:
			return -1
		default:
			return 0
		}
	}
	s := sign(results[0].EffectSigned)
	for _, r := range results[1:] {
		if sign(r.EffectSigned) != s {
			return false
		}
	}
	return true
}