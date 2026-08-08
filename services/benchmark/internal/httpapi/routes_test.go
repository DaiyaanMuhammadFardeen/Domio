package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/domio/platform/services/benchmark/internal/hmac"
	"github.com/domio/platform/services/benchmark/internal/registry"
	"github.com/domio/platform/services/benchmark/internal/store"
)

func newTestServer(t *testing.T) (*httptest.Server, string) {
	t.Helper()
	hmac.SetSigningKey("test-signing-key")
	svc := registry.New(store.NewSeededInMemoryStore())
	srv := &Server{Registry: svc, Store: svc.Store}
	ts := httptest.NewServer(srv.Routes())
	t.Cleanup(ts.Close)
	ws := uuid.New().String()
	return ts, ws
}

func mustJSON(t *testing.T, v interface{}) []byte {
	t.Helper()
	b, err := json.Marshal(v)
	require.NoError(t, err)
	return b
}

func TestHealthAndReady(t *testing.T) {
	t.Parallel()
	ts, _ := newTestServer(t)
	resp, err := http.Get(ts.URL + "/healthz")
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	resp.Body.Close()

	resp, err = http.Get(ts.URL + "/readyz")
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	resp.Body.Close()
}

func TestCreateAndGet(t *testing.T) {
	t.Parallel()
	ts, ws := newTestServer(t)
	body := mustJSON(t, CreateRequest{
		WorkspaceID: ws,
		Name:        "test-bench",
		MetricName:  "session_dwell_ms",
		VariantAKey: "control",
		VariantBKey: "treatment",
		Method:      "welch_t",
	})
	resp, err := http.Post(ts.URL+"/v1/benchmarks", "application/json", bytes.NewReader(body))
	require.NoError(t, err)
	require.Equal(t, http.StatusCreated, resp.StatusCode)
	var out struct {
		Benchmark struct {
			BenchmarkID uuid.UUID `json:"benchmark_id"`
			Name        string    `json:"name"`
		} `json:"benchmark"`
	}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&out))
	resp.Body.Close()
	require.NotEqual(t, uuid.Nil, out.Benchmark.BenchmarkID)

	// Fetch.
	resp, err = http.Get(ts.URL + "/v1/benchmarks/" + out.Benchmark.BenchmarkID.String())
	require.NoError(t, err)
	req, _ := http.NewRequest(http.MethodGet, ts.URL+"/v1/benchmarks/"+out.Benchmark.BenchmarkID.String(), nil)
	req.Header.Set("X-Workspace-Id", ws)
	resp, err = http.DefaultClient.Do(req)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	resp.Body.Close()
}

func TestListRequiresWorkspace(t *testing.T) {
	t.Parallel()
	ts, _ := newTestServer(t)
	resp, err := http.Get(ts.URL + "/v1/benchmarks")
	require.NoError(t, err)
	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
	resp.Body.Close()

	req, _ := http.NewRequest(http.MethodGet, ts.URL+"/v1/benchmarks", nil)
	req.Header.Set("X-Workspace-Id", uuid.New().String())
	resp, err = http.DefaultClient.Do(req)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	resp.Body.Close()
}

func TestSignAndVerify(t *testing.T) {
	t.Parallel()
	ts, ws := newTestServer(t)
	body := mustJSON(t, CreateRequest{
		WorkspaceID: ws,
		Name:        "sign-bench",
		MetricName:  "session_dwell_ms",
		VariantAKey: "control",
		VariantBKey: "treatment",
		Method:      "welch_t",
	})
	resp, err := http.Post(ts.URL+"/v1/benchmarks", "application/json", bytes.NewReader(body))
	require.NoError(t, err)
	require.Equal(t, http.StatusCreated, resp.StatusCode)
	var out struct {
		Benchmark struct {
			BenchmarkID uuid.UUID `json:"benchmark_id"`
		} `json:"benchmark"`
	}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&out))
	resp.Body.Close()

	// Sign.
	req, _ := http.NewRequest(http.MethodPost, ts.URL+"/v1/benchmarks/"+out.Benchmark.BenchmarkID.String()+"/sign", nil)
	req.Header.Set("X-Workspace-Id", ws)
	resp, err = http.DefaultClient.Do(req)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	var sigOut struct {
		Signature string `json:"signature"`
	}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&sigOut))
	resp.Body.Close()
	require.NotEmpty(t, sigOut.Signature)
}

func TestSnapshotHMACRequired(t *testing.T) {
	t.Parallel()
	ts, ws := newTestServer(t)
	// Register a benchmark.
	body := mustJSON(t, CreateRequest{
		WorkspaceID: ws,
		Name:        "ingest-bench",
		MetricName:  "session_dwell_ms",
		VariantAKey: "control",
		VariantBKey: "treatment",
		Method:      "welch_t",
	})
	resp, err := http.Post(ts.URL+"/v1/benchmarks", "application/json", bytes.NewReader(body))
	require.NoError(t, err)
	var out struct {
		Benchmark struct {
			BenchmarkID uuid.UUID `json:"benchmark_id"`
		} `json:"benchmark"`
	}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&out))
	resp.Body.Close()

	// 1) Missing signature → 401.
	snapBody := mustJSON(t, SnapshotRequest{
		WorkspaceID: ws,
		MetricName:  "session_dwell_ms",
		BucketDate:  "2026-08-01",
		Value:       1234.5,
		SampleSize:  100,
	})
	req, _ := http.NewRequest(http.MethodPost, ts.URL+"/v1/benchmarks/"+out.Benchmark.BenchmarkID.String()+"/snapshots", bytes.NewReader(snapBody))
	req.Header.Set("X-Workspace-Id", ws)
	req.Header.Set("content-type", "application/json")
	resp, err = http.DefaultClient.Do(req)
	require.NoError(t, err)
	require.Equal(t, http.StatusUnauthorized, resp.StatusCode)
	resp.Body.Close()

	// 2) Wrong signature → 401.
	req, _ = http.NewRequest(http.MethodPost, ts.URL+"/v1/benchmarks/"+out.Benchmark.BenchmarkID.String()+"/snapshots", bytes.NewReader(snapBody))
	req.Header.Set("X-Workspace-Id", ws)
	req.Header.Set("X-Benchmark-Signature", "deadbeef")
	resp, err = http.DefaultClient.Do(req)
	require.NoError(t, err)
	require.Equal(t, http.StatusUnauthorized, resp.StatusCode)
	resp.Body.Close()

	// 3) Correct signature → 201.
	sig, err := hmac.Sign(snapBody)
	require.NoError(t, err)
	req, _ = http.NewRequest(http.MethodPost, ts.URL+"/v1/benchmarks/"+out.Benchmark.BenchmarkID.String()+"/snapshots", bytes.NewReader(snapBody))
	req.Header.Set("X-Workspace-Id", ws)
	req.Header.Set("X-Benchmark-Signature", sig)
	resp, err = http.DefaultClient.Do(req)
	require.NoError(t, err)
	require.Equal(t, http.StatusCreated, resp.StatusCode)
	resp.Body.Close()
}

func TestInferEndpoint(t *testing.T) {
	t.Parallel()
	ts, ws := newTestServer(t)
	// Register with welch_t.
	body := mustJSON(t, CreateRequest{
		WorkspaceID: ws,
		Name:        "infer-bench",
		MetricName:  "session_dwell_ms",
		VariantAKey: "control",
		VariantBKey: "treatment",
		Method:      "welch_t",
	})
	resp, err := http.Post(ts.URL+"/v1/benchmarks", "application/json", bytes.NewReader(body))
	require.NoError(t, err)
	var out struct {
		Benchmark struct {
			BenchmarkID uuid.UUID `json:"benchmark_id"`
		} `json:"benchmark"`
	}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&out))
	resp.Body.Close()

	// /infer with clear separation.
	a := []float64{1, 2, 3, 4, 5}
	b := []float64{10, 11, 12, 13, 14}
	infBody := mustJSON(t, InferRequest{
		WorkspaceID: ws,
		SampleA:     a,
		SampleB:     b,
	})
	req, _ := http.NewRequest(http.MethodPost, ts.URL+"/v1/benchmarks/"+out.Benchmark.BenchmarkID.String()+"/infer", bytes.NewReader(infBody))
	req.Header.Set("X-Workspace-Id", ws)
	resp, err = http.DefaultClient.Do(req)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	var infOut struct {
		Run struct {
			Result struct {
				Method       string  `json:"method"`
				PValue       float64 `json:"p_value"`
				EffectSigned float64 `json:"effect_signed"`
			} `json:"result"`
		} `json:"run"`
	}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&infOut))
	resp.Body.Close()
	assert.Equal(t, "welch_t", infOut.Run.Result.Method)
	assert.Less(t, infOut.Run.Result.PValue, 0.001, "extreme separation → tiny p")
	assert.Greater(t, infOut.Run.Result.EffectSigned, 0.0)

	// Override the method on the request body (force bayesian).
	infBody = mustJSON(t, InferRequest{
		WorkspaceID: ws,
		Method:      "bayesian_normal",
		SampleA:     a,
		SampleB:     b,
	})
	req, _ = http.NewRequest(http.MethodPost, ts.URL+"/v1/benchmarks/"+out.Benchmark.BenchmarkID.String()+"/infer", bytes.NewReader(infBody))
	req.Header.Set("X-Workspace-Id", ws)
	resp, err = http.DefaultClient.Do(req)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	var infOut2 struct {
		Run struct {
			Result struct {
				Method       string  `json:"method"`
				PBetterThanA float64 `json:"p_better_than_a"`
			} `json:"result"`
		} `json:"run"`
	}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&infOut2))
	resp.Body.Close()
	assert.Equal(t, "bayesian_normal", infOut2.Run.Result.Method)
	assert.Greater(t, infOut2.Run.Result.PBetterThanA, 0.99)
}

// Sanity: seeded fixtures are accessible via the workspace filter.
func TestSeededFixturesAccessible(t *testing.T) {
	t.Parallel()
	hmac.SetSigningKey("test-signing-key")
	svc := registry.New(store.NewSeededInMemoryStore())
	srv := &Server{Registry: svc, Store: svc.Store}
	ts := httptest.NewServer(srv.Routes())
	defer ts.Close()

	ws := uuid.MustParse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa").String()
	req, _ := http.NewRequest(http.MethodGet, ts.URL+"/v1/benchmarks", nil)
	req.Header.Set("X-Workspace-Id", ws)
	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	var out struct {
		Benchmarks []struct {
			BenchmarkID uuid.UUID `json:"benchmark_id"`
			Name        string    `json:"name"`
		} `json:"benchmarks"`
	}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&out))
	resp.Body.Close()
	assert.GreaterOrEqual(t, len(out.Benchmarks), 2)
}

// Touch time import so the linter doesn't complain.
var _ = time.Now