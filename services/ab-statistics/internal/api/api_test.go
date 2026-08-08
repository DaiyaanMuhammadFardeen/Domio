package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCheckEndpoint(t *testing.T) {
	srv := &Server{}
	body, _ := json.Marshal(CheckRequest{
		WorkspaceID:   "ws-1",
		TestID:        "test-1",
		NA:            5000, KA: 500,
		NB:            5000, KB: 800,
		AlphaBudget:   0.05,
		MinSampleSize: 100,
	})
	req := httptest.NewRequest(http.MethodPost, "/v1/check", bytes.NewReader(body))
	rr := httptest.NewRecorder()
	srv.Routes().ServeHTTP(rr, req)
	require.Equal(t, http.StatusOK, rr.Code)
	var out map[string]interface{}
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &out))
	dec, ok := out["decision"].(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, "stop_for_winner", dec["action"])
}

func TestPowerEndpoint(t *testing.T) {
	srv := &Server{}
	// p1 = 0.10, p2 = 0.12, alpha = 0.05, power = 0.8 → standard
	// formula yields ~3,800 per arm.
	body, _ := json.Marshal(PowerRequest{
		BaselineRate:  0.10,
		MinDetectable: 0.12,
		Alpha:         0.05,
		Power:         0.8,
	})
	req := httptest.NewRequest(http.MethodPost, "/v1/power", bytes.NewReader(body))
	rr := httptest.NewRecorder()
	srv.Routes().ServeHTTP(rr, req)
	require.Equal(t, http.StatusOK, rr.Code)
	var out PowerResponse
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &out))
	assert.Greater(t, out.RequiredSamples, 3_000)
	assert.Less(t, out.RequiredSamples, 5_000)
}

func TestPowerZeroEffect(t *testing.T) {
	srv := &Server{}
	body, _ := json.Marshal(PowerRequest{
		BaselineRate: 0.10, MinDetectable: 0.10, Alpha: 0.05, Power: 0.8,
	})
	req := httptest.NewRequest(http.MethodPost, "/v1/power", bytes.NewReader(body))
	rr := httptest.NewRecorder()
	srv.Routes().ServeHTTP(rr, req)
	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestPowerInvalidRate(t *testing.T) {
	srv := &Server{}
	body, _ := json.Marshal(PowerRequest{
		BaselineRate: 0.0, MinDetectable: 0.1, Alpha: 0.05, Power: 0.8,
	})
	req := httptest.NewRequest(http.MethodPost, "/v1/power", bytes.NewReader(body))
	rr := httptest.NewRecorder()
	srv.Routes().ServeHTTP(rr, req)
	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestHealthEndpoint(t *testing.T) {
	srv := &Server{}
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rr := httptest.NewRecorder()
	srv.Routes().ServeHTTP(rr, req)
	assert.Equal(t, http.StatusOK, rr.Code)
}

func TestCheckMethodNotAllowed(t *testing.T) {
	srv := &Server{}
	req := httptest.NewRequest(http.MethodGet, "/v1/check", nil)
	rr := httptest.NewRecorder()
	srv.Routes().ServeHTTP(rr, req)
	assert.Equal(t, http.StatusMethodNotAllowed, rr.Code)
}

func TestInverseNormalCDF(t *testing.T) {
	// 0.975 → 1.96, 0.5 → 0, 0.84 → ~0.994
	assert.InDelta(t, 1.96, inverseNormalCDF(0.975), 0.01)
	assert.InDelta(t, 0.0, inverseNormalCDF(0.5), 0.01)
	assert.InDelta(t, 0.994, inverseNormalCDF(0.84), 0.01)
}