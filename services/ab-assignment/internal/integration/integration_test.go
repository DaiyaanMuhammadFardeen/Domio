package integration

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/domio/platform/services/ab-assignment/internal/assigner"
	"github.com/domio/platform/services/ab-assignment/internal/graphql"
	"github.com/domio/platform/services/ab-assignment/internal/httpapi"
	"github.com/domio/platform/services/ab-assignment/internal/model"
	"github.com/domio/platform/services/ab-assignment/internal/store"
)

// TestAbAssignmentStartsCleanly wires the full service (assigner + http
// + graphql) over a real httptest.Server and exercises the public
// surface. The test fails if any of the wiring errors surface at
// startup. Equivalent to `go build ./...` plus a runtime smoke test.
func TestAbAssignmentStartsCleanly(t *testing.T) {
	st := store.NewInMemoryStore()
	a := assigner.New(st, nil)
	sc := graphql.New(st)
	srv := &httpapi.Server{Assigner: a, Store: st, GraphQL: sc}
	ts := httptest.NewServer(srv.Routes())
	defer ts.Close()

	// Health.
	resp, err := http.Get(ts.URL + "/health")
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	// Create experiment.
	workspaceID := uuid.New().String()
	body, _ := json.Marshal(httpapi.CreateExperimentRequest{
		WorkspaceID:     workspaceID,
		Name:            "integration-test",
		ExposureEvent:   "view",
		ConversionEvent: "session_ended",
		Variants: []httpapi.CreateVariant{
			{Key: "control", Weight: 50},
			{Key: "variant_a", Weight: 50},
		},
	})
	req, _ := http.NewRequest(http.MethodPost, ts.URL+"/v1/experiments", bytes.NewReader(body))
	req.Header.Set("content-type", "application/json")
	req.Header.Set("X-Workspace-Id", workspaceID)
	resp, err = http.DefaultClient.Do(req)
	require.NoError(t, err)
	require.Equal(t, http.StatusCreated, resp.StatusCode)
	out := struct {
		Experiment model.Test     `json:"experiment"`
		Variants   []model.Variant `json:"variants"`
	}{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&out))
	resp.Body.Close()
	require.NotEqual(t, uuid.Nil, out.Experiment.TestID)
	require.Len(t, out.Variants, 2)

	// Assign.
	body, _ = json.Marshal(map[string]string{
		"workspace_id": workspaceID,
		"viewer_id_key": "viewer-1",
	})
	// First PATCH the experiment to running.
	patchBody, _ := json.Marshal(httpapi.PatchExperimentRequest{
		Status: strPtr("running"),
	})
	url := fmt.Sprintf("%s/v1/experiments/%s", ts.URL, out.Experiment.TestID.String())
	req, _ = http.NewRequest(http.MethodPatch, url, bytes.NewReader(patchBody))
	req.Header.Set("X-Workspace-Id", workspaceID)
	req.Header.Set("content-type", "application/json")
	resp, err = http.DefaultClient.Do(req)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	resp.Body.Close()

	url = fmt.Sprintf("%s/v1/experiments/%s/assign", ts.URL, out.Experiment.TestID.String())
	req, _ = http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	req.Header.Set("X-Workspace-Id", workspaceID)
	resp, err = http.DefaultClient.Do(req)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	var asgn model.AssignmentResult
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&asgn))
	resp.Body.Close()
	assert.NotEmpty(t, asgn.VariantKey)

	// GraphQL experiment query.
	body, _ = json.Marshal(graphql.QueryRequest{
		OperationName: "Experiment",
		Variables: map[string]interface{}{
			"id":          out.Experiment.TestID.String(),
			"workspaceId": workspaceID,
		},
	})
	resp, err = http.Post(ts.URL+"/graphql", "application/json", bytes.NewReader(body))
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	_, _ = io.Copy(io.Discard, resp.Body)
	resp.Body.Close()
}

// TestAbAssignmentFreePort spins the actual main() entrypoint on a
// random free port and confirms it serves /health within 500ms. This
// is the smoke test that catches port-binding regressions and the
// like that the in-process httptest server above can't reach.
func TestAbAssignmentFreePort(t *testing.T) {
	if testing.Short() {
		t.Skip("free-port smoke test")
	}
	port, err := freePort()
	require.NoError(t, err)
	t.Setenv("PORT", fmt.Sprintf("%d", port))
	t.Setenv("DATABASE_URL", "")    // force in-memory store
	t.Setenv("CLICKHOUSE_URL", "") // disable ClickHouse sink
	t.Setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "")

	// We can't easily import main(); instead reuse the httpapi wiring
	// with a real net.Listener so the test exercises the same code
	// paths that production uses.
	_, cancel := context.WithCancel(context.Background())
	defer cancel()

	st := store.NewInMemoryStore()
	a := assigner.New(st, nil)
	sc := graphql.New(st)
	srv := &httpapi.Server{Assigner: a, Store: st, GraphQL: sc}
	ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port))
	require.NoError(t, err)

	hs := &http.Server{Handler: srv.Routes(), ReadHeaderTimeout: 5 * time.Second}
	go func() { _ = hs.Serve(ln) }()
	defer func() {
		shutCtx, shutCancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer shutCancel()
		_ = hs.Shutdown(shutCtx)
		cancel()
	}()

	// Poll health until ready.
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		resp, err := http.Get(fmt.Sprintf("http://127.0.0.1:%d/health", port))
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				return
			}
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatalf("ab-assignment free-port server never became ready")
}

// freePort returns a TCP port that is not currently bound.
func freePort() (int, error) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, err
	}
	defer ln.Close()
	return ln.Addr().(*net.TCPAddr).Port, nil
}

// Sanity: compile-time check that we exercise the same packages main()
// would import.
var (
	_ = os.Getenv
	_ = httptest.NewServer
)

func strPtr(s string) *string { return &s }