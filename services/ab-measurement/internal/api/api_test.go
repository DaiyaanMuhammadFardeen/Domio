package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newTestServer() *Server {
	return &Server{}
}

func TestMeasureEndpoint(t *testing.T) {
	srv := newTestServer()
	body, err := json.Marshal(MeasureRequest{
		WorkspaceID: uuid.New().String(),
		TestID:      uuid.New().String(),
		Variants: []VariantCounts{
			{VariantID: uuid.New().String(), VariantKey: "control", Exposures: 1000, Conversions: 100},
			{VariantID: uuid.New().String(), VariantKey: "variant_a", Exposures: 1000, Conversions: 130},
		},
		Draws: 5000,
	})
	require.NoError(t, err)
	req := httptest.NewRequest(http.MethodPost, "/v1/measure", bytes.NewReader(body))
	rr := httptest.NewRecorder()
	srv.Routes().ServeHTTP(rr, req)
	assert.Equal(t, http.StatusOK, rr.Code)
	var resp MeasureResponse
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	assert.Greater(t, resp.LiftMean, 0.02)
	assert.Greater(t, resp.ProbBBeatsA, 0.95)
	assert.Less(t, resp.PValue, 0.05)
	assert.Equal(t, 5000, resp.Draws)
}

func TestMeasureEndpointValidation(t *testing.T) {
	srv := newTestServer()
	body, _ := json.Marshal(MeasureRequest{
		WorkspaceID: uuid.New().String(),
		TestID:      uuid.New().String(),
		Variants:    []VariantCounts{}, // missing variants
	})
	req := httptest.NewRequest(http.MethodPost, "/v1/measure", bytes.NewReader(body))
	rr := httptest.NewRecorder()
	srv.Routes().ServeHTTP(rr, req)
	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestMeasureEqualArms(t *testing.T) {
	srv := newTestServer()
	body, _ := json.Marshal(MeasureRequest{
		WorkspaceID: uuid.New().String(),
		TestID:      uuid.New().String(),
		Variants: []VariantCounts{
			{VariantID: uuid.New().String(), VariantKey: "a", Exposures: 5000, Conversions: 250},
			{VariantID: uuid.New().String(), VariantKey: "b", Exposures: 5000, Conversions: 250},
		},
		Draws: 5000,
	})
	req := httptest.NewRequest(http.MethodPost, "/v1/measure", bytes.NewReader(body))
	rr := httptest.NewRecorder()
	srv.Routes().ServeHTTP(rr, req)
	assert.Equal(t, http.StatusOK, rr.Code)
	var resp MeasureResponse
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	assert.InDelta(t, 0.0, resp.LiftMean, 0.01)
	assert.InDelta(t, 0.5, resp.ProbBBeatsA, 0.05)
}

func TestHealthEndpoint(t *testing.T) {
	srv := newTestServer()
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rr := httptest.NewRecorder()
	srv.Routes().ServeHTTP(rr, req)
	assert.Equal(t, http.StatusOK, rr.Code)
}

func TestMethodNotAllowed(t *testing.T) {
	srv := newTestServer()
	req := httptest.NewRequest(http.MethodGet, "/v1/measure", nil)
	rr := httptest.NewRecorder()
	srv.Routes().ServeHTTP(rr, req)
	assert.Equal(t, http.StatusMethodNotAllowed, rr.Code)
}