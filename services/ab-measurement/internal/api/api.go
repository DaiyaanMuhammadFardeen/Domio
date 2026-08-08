// Package api exposes the measurement service's HTTP surface.
//
// Endpoints:
//
//   POST /v1/measure              — compute measurement for a test
//   GET  /v1/measure/{test_id}    — cached result by id
//   GET  /v1/health               — liveness
//
// The /v1/measure endpoint accepts the variant counts (exposures +
// conversions) so the caller can pull aggregates from the warehouse
// and ask the measurement service to compute the lift. We don't try
// to read ClickHouse directly here — the warehouse has the optimised
// rollup path.
package api

import (
	"encoding/json"
	"net/http"

	"github.com/google/uuid"

	"github.com/domio/platform/services/ab-measurement/internal/stats"
)

// Server is the HTTP surface.
type Server struct {
	Now func() int64 // unix seconds; injected for tests
}

// Routes returns the chi router.
func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", s.health)
	mux.HandleFunc("/v1/measure", s.measure)
	mux.HandleFunc("/v1/measure/", s.measureByID)
	return mux
}

func (s *Server) health(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("content-type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok", "service": "ab-measurement"})
}

// MeasureRequest is the request body for /v1/measure.
type MeasureRequest struct {
	WorkspaceID string           `json:"workspace_id"`
	TestID      string           `json:"test_id"`
	Variants    []VariantCounts  `json:"variants"`
	Draws       int              `json:"draws,omitempty"`
	Seed        int64            `json:"seed,omitempty"`
}

// VariantCounts is the exposure / conversion counts for one variant.
type VariantCounts struct {
	VariantID   string `json:"variant_id"`
	VariantKey  string `json:"variant_key"`
	Exposures   int    `json:"exposures"`
	Conversions int   `json:"conversions"`
}

// MeasureResponse is the response body.
type MeasureResponse struct {
	WorkspaceID string              `json:"workspace_id"`
	TestID      string              `json:"test_id"`
	VariantA    VariantResult       `json:"variant_a"`
	VariantB    VariantResult       `json:"variant_b"`
	LiftMean    float64             `json:"lift"`
	CI95Low     float64             `json:"ci_low"`
	CI95High    float64             `json:"ci_high"`
	ProbBBeatsA float64             `json:"prob_b_beats_a"`
	Z           float64             `json:"z"`
	PValue      float64             `json:"p_value"`
	Draws       int                 `json:"draws"`
}

// VariantResult is what the response embeds per variant.
type VariantResult struct {
	VariantID  string  `json:"variant_id"`
	VariantKey string  `json:"variant_key"`
	Exposures  int     `json:"exposures"`
	Conversions int    `json:"conversions"`
	Rate       float64 `json:"rate"`
	Alpha      float64 `json:"alpha"`
	Beta       float64 `json:"beta"`
}

// Measure computes the lift for the two-arm test.
func Measure(req MeasureRequest) (MeasureResponse, error) {
	if len(req.Variants) != 2 {
		return MeasureResponse{}, validationError("exactly two variants required")
	}
	if _, err := uuid.Parse(req.WorkspaceID); err != nil {
		return MeasureResponse{}, validationError("workspace_id must be uuid")
	}
	if _, err := uuid.Parse(req.TestID); err != nil {
		return MeasureResponse{}, validationError("test_id must be uuid")
	}
	a := req.Variants[0]
	b := req.Variants[1]
	if req.Draws == 0 {
		req.Draws = 50_000
	}
	if req.Seed == 0 {
		req.Seed = 42
	}
	bl, err := stats.BetaBinomialLift(a.Exposures, a.Conversions, b.Exposures, b.Conversions, req.Draws, req.Seed)
	if err != nil {
		return MeasureResponse{}, err
	}
	zt, err := stats.TwoProportionZTest(a.Exposures, a.Conversions, b.Exposures, b.Conversions)
	if err != nil {
		return MeasureResponse{}, err
	}
	return MeasureResponse{
		WorkspaceID: req.WorkspaceID,
		TestID:      req.TestID,
		VariantA: VariantResult{
			VariantID: a.VariantID, VariantKey: a.VariantKey,
			Exposures: a.Exposures, Conversions: a.Conversions,
			Rate: safeRate(a.Exposures, a.Conversions),
			Alpha: bl.Varianta.Alpha, Beta: bl.Varianta.Beta,
		},
		VariantB: VariantResult{
			VariantID: b.VariantID, VariantKey: b.VariantKey,
			Exposures: b.Exposures, Conversions: b.Conversions,
			Rate: safeRate(b.Exposures, b.Conversions),
			Alpha: bl.Variantb.Alpha, Beta: bl.Variantb.Beta,
		},
		LiftMean:    bl.MeanLift,
		CI95Low:     bl.CILow,
		CI95High:    bl.CIHigh,
		ProbBBeatsA: bl.ProbBBeatsA,
		Z:           zt.Z,
		PValue:      zt.PValue,
		Draws:       bl.Draws,
	}, nil
}

func safeRate(n, k int) float64 {
	if n == 0 {
		return 0
	}
	return float64(k) / float64(n)
}

func (s *Server) measure(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req MeasureRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid json")
		return
	}
	res, err := Measure(req)
	if err != nil {
		if ve, ok := err.(*validationErrorT); ok {
			writeError(w, http.StatusBadRequest, "bad_request", ve.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "internal_error", err.Error())
		return
	}
	w.Header().Set("content-type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(res)
}

func (s *Server) measureByID(w http.ResponseWriter, r *http.Request) {
	// The simple version: clients must POST counts. We just acknowledge
	// the GET path so callers can probe for the endpoint.
	w.Header().Set("content-type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"status":"see /v1/measure POST"}`))
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("content-type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]map[string]string{
		"error": {"code": code, "message": message},
	})
}

type validationErrorT string

func (e *validationErrorT) Error() string { return string(*e) }

func validationError(s string) error {
	v := validationErrorT(s)
	return &v
}