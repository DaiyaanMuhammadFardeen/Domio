// Package api is the HTTP surface for the ab-statistics service.
package api

import (
	"encoding/json"
	"net/http"

	"github.com/domio/platform/services/ab-statistics/internal/seqtest"
)

// Server is the HTTP surface.
type Server struct{}

// Routes returns a http.Handler.
func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", s.health)
	mux.HandleFunc("/v1/check", s.check)
	mux.HandleFunc("/v1/power", s.power)
	return mux
}

func (s *Server) health(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("content-type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok", "service": "ab-statistics"})
}

// CheckRequest is the body for /v1/check.
type CheckRequest struct {
	WorkspaceID    string  `json:"workspace_id"`
	TestID         string  `json:"test_id"`
	NA             int     `json:"n_a"`
	KA             int     `json:"k_a"`
	NB             int     `json:"n_b"`
	KB             int     `json:"k_b"`
	AlphaBudget    float64 `json:"alpha_budget,omitempty"`
	MinSampleSize  int     `json:"min_sample_size,omitempty"`
}

// Check runs the mSPRT decision.
func (s *Server) check(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req CheckRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid json")
		return
	}
	cfg := seqtest.DefaultConfig()
	if req.AlphaBudget > 0 {
		cfg.AlphaBudget = req.AlphaBudget
	}
	if req.MinSampleSize > 0 {
		cfg.MinSampleSize = req.MinSampleSize
	}
	dec, err := seqtest.Evaluate(cfg, req.NA, req.KA, req.NB, req.KB)
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	w.Header().Set("content-type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"workspace_id": req.WorkspaceID,
		"test_id":      req.TestID,
		"decision":     dec,
	})
}

// PowerRequest is the body for /v1/power (power analysis tool).
type PowerRequest struct {
	BaselineRate  float64 `json:"baseline_rate"`
	MinDetectable float64 `json:"min_detectable"`
	Alpha         float64 `json:"alpha,omitempty"`
	Power         float64 `json:"power,omitempty"`
}

// PowerResponse is the power analysis output.
type PowerResponse struct {
	RequiredSamples int     `json:"required_samples_per_arm"`
	BaselineRate    float64 `json:"baseline_rate"`
	MinDetectable   float64 `json:"min_detectable"`
	Alpha           float64 `json:"alpha"`
	Power           float64 `json:"power"`
}

// Power calculates the required sample size per arm for a two-proportion
// z-test. Standard formula:
//
//   n = (z_{α/2} + z_β)^2 · (p1(1-p1) + p2(1-p2)) / (p2 - p1)^2
func (s *Server) power(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req PowerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid json")
		return
	}
	if req.Alpha == 0 {
		req.Alpha = 0.05
	}
	if req.Power == 0 {
		req.Power = 0.8
	}
	res, err := Power(req.BaselineRate, req.MinDetectable, req.Alpha, req.Power)
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	w.Header().Set("content-type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(res)
}

// Power is the implementation of the power calculation.
func Power(p1, p2, alpha, power float64) (PowerResponse, error) {
	if p1 <= 0 || p1 >= 1 {
		return PowerResponse{}, errInvalidRate
	}
	if p2 <= 0 || p2 >= 1 {
		return PowerResponse{}, errInvalidRate
	}
	if p1 == p2 {
		return PowerResponse{}, errZeroEffect
	}
	if alpha <= 0 || alpha >= 1 {
		return PowerResponse{}, errInvalidAlpha
	}
	if power <= 0 || power >= 1 {
		return PowerResponse{}, errInvalidPower
	}
	zAlpha := inverseNormalCDF(1 - alpha/2)
	zBeta := inverseNormalCDF(power)
	num := (zAlpha + zBeta) * (zAlpha + zBeta) * (p1*(1-p1) + p2*(1-p2))
	den := (p2 - p1) * (p2 - p1)
	n := int(num/den + 0.999) // ceiling
	return PowerResponse{
		RequiredSamples: n,
		BaselineRate:    p1,
		MinDetectable:   p2,
		Alpha:           alpha,
		Power:           power,
	}, nil
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("content-type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]map[string]string{
		"error": {"code": code, "message": message},
	})
}

// Error sentinels.
type errorString string

func (e errorString) Error() string { return string(e) }

const (
	errInvalidRate  = errorString("invalid rate")
	errZeroEffect   = errorString("zero effect size")
	errInvalidAlpha = errorString("invalid alpha")
	errInvalidPower = errorString("invalid power")
)

// inverseNormalCDF approximates the inverse standard normal CDF using
// the Beasley-Springer-Moro algorithm. Accurate to ~1e-9.
func inverseNormalCDF(p float64) float64 {
	// Coefficients for the rational approximation.
	a := []float64{-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00}
	b := []float64{-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01}
	c := []float64{-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00}
	d := []float64{7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00}
	plow := 0.02425
	phigh := 1 - plow
	var q, r float64
	switch {
	case p < plow:
		q = mathSqrt(-2 * mathLog(p))
		return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q + c[5]) /
			((((d[0]*q+d[1])*q+d[2])*q+d[3])*q + 1)
	case p <= phigh:
		q = p - 0.5
		r = q * q
		return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r + a[5]) * q /
			(((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r + 1)
	default:
		q = mathSqrt(-2 * mathLog(1-p))
		return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q + c[5]) /
			((((d[0]*q+d[1])*q+d[2])*q+d[3])*q + 1)
	}
}

// mathSqrt is a tiny indirection so we can swap implementations later.
func mathSqrt(x float64) float64 {
	// Inline math.Sqrt to avoid pulling math into this file's tests
	// (where it would mask nothing — but the indirection keeps the
	// file's testing surface stable if we replace the implementation).
	if x <= 0 {
		return 0
	}
	z := x / 2
	for i := 0; i < 30; i++ {
		z = (z + x/z) / 2
	}
	return z
}

// mathLog is a tiny indirection for the natural log.
func mathLog(x float64) float64 {
	// Series expansion around 1: log(x) = 2·atanh((x-1)/(x+1)).
	if x <= 0 {
		return 0
	}
	y := (x - 1) / (x + 1)
	y2 := y * y
	sum := 0.0
	term := y
	for i := 0; i < 60; i++ {
		sum += term / float64(2*i+1)
		term *= y2
	}
	return 2 * sum
}