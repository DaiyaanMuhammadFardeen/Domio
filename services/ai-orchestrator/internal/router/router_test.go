package router

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"

	"github.com/domio/platform/services/ai-orchestrator/internal/executor"
	"github.com/domio/platform/services/ai-orchestrator/internal/planner"
	"github.com/domio/platform/services/ai-orchestrator/internal/renderer"
	"github.com/domio/platform/services/ai-orchestrator/internal/store"
)

// ─── Test helpers ────────────────────────────────────────────────────

type testProvider struct {
	name     string
	response string
	tokens   int
	cost     float64
	err      error
}

func (p *testProvider) Name() string { return p.name }

func (p *testProvider) Complete(_ context.Context, _ string) (string, int, float64, error) {
	return p.response, p.tokens, p.cost, p.err
}

type alwaysFailProvider struct {
	name string
}

func (p *alwaysFailProvider) Name() string { return p.name }

func (p *alwaysFailProvider) Complete(_ context.Context, _ string) (string, int, float64, error) {
	return "", 0, 0, errAlwaysFail
}

var errAlwaysFail = errFail("always fails")

type errFail string

func (e errFail) Error() string { return string(e) }

func newTestRouter(t *testing.T) (chi.Router, *executor.Executor) {
	t.Helper()
	logger := zap.NewNop()
	p := planner.New(3)
	providers := []executor.Provider{
		&testProvider{name: "openai", response: "test response", tokens: 10, cost: 0.001},
	}
	exec := executor.New(providers, 3, 100.0, 5)

	deckStore := renderer.NewMemDeckStore()
	cfg := Config{
		Logger:         logger,
		Executor:       exec,
		Planner:        p,
		Store:          store.NewMemStore(),
		Renderer:       renderer.NewDeckRenderer(deckStore, nil),
		ModerationGate: true,
		MaxCostPerReq:  100.0,
	}
	return New(cfg), exec
}

// ─── Tests ───────────────────────────────────────────────────────────

func TestHealthz(t *testing.T) {
	r, _ := newTestRouter(t)
	ts := httptest.NewServer(r)
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/healthz")
	if err != nil {
		t.Fatalf("GET /healthz: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("status = %d, want %d", resp.StatusCode, http.StatusOK)
	}
}

func TestReadyz(t *testing.T) {
	r, _ := newTestRouter(t)
	ts := httptest.NewServer(r)
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/readyz")
	if err != nil {
		t.Fatalf("GET /readyz: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("status = %d, want %d", resp.StatusCode, http.StatusOK)
	}
}

func TestCreateJobSuccess(t *testing.T) {
	r, _ := newTestRouter(t)
	ts := httptest.NewServer(r)
	defer ts.Close()

	body, _ := json.Marshal(createJobRequest{
		Type:    "deck.generate",
		Payload: json.RawMessage(`{"goal":"generate a deck"}`),
	})

	req, _ := http.NewRequest("POST", ts.URL+"/v1/ai/jobs", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Idempotency-Key", "test-idem-key-001")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("POST /v1/ai/jobs: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusAccepted {
		t.Errorf("status = %d, want %d", resp.StatusCode, http.StatusAccepted)
	}

	var accepted aiJobAccepted
	json.NewDecoder(resp.Body).Decode(&accepted)
	if accepted.Status != "queued" {
		t.Errorf("Status = %q, want queued", accepted.Status)
	}
	if accepted.JobID == "" {
		t.Error("JobID should not be empty")
	}
	if accepted.StreamURL == "" {
		t.Error("StreamURL should not be empty")
	}
}

func TestCreateJobMissingType(t *testing.T) {
	r, _ := newTestRouter(t)
	ts := httptest.NewServer(r)
	defer ts.Close()

	body, _ := json.Marshal(createJobRequest{
		Payload: json.RawMessage(`{"goal":"test"}`),
	})

	req, _ := http.NewRequest("POST", ts.URL+"/v1/ai/jobs", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Idempotency-Key", "test-idem-key-002")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("POST /v1/ai/jobs: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", resp.StatusCode, http.StatusBadRequest)
	}
}

func TestCreateJobMissingIdempotencyKey(t *testing.T) {
	r, _ := newTestRouter(t)
	ts := httptest.NewServer(r)
	defer ts.Close()

	body, _ := json.Marshal(createJobRequest{
		Type:    "deck.generate",
		Payload: json.RawMessage(`{"goal":"test"}`),
	})

	resp, err := http.Post(ts.URL+"/v1/ai/jobs", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("POST /v1/ai/jobs: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", resp.StatusCode, http.StatusBadRequest)
	}
}

func TestCreateJobEmptyPayload(t *testing.T) {
	r, _ := newTestRouter(t)
	ts := httptest.NewServer(r)
	defer ts.Close()

	body, _ := json.Marshal(createJobRequest{
		Type: "deck.generate",
	})

	req, _ := http.NewRequest("POST", ts.URL+"/v1/ai/jobs", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Idempotency-Key", "test-idem-key-003")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("POST /v1/ai/jobs: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", resp.StatusCode, http.StatusBadRequest)
	}
}

func TestGetJobNotFound(t *testing.T) {
	r, _ := newTestRouter(t)
	ts := httptest.NewServer(r)
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/v1/ai/jobs/nonexistent")
	if err != nil {
		t.Fatalf("GET /v1/ai/jobs: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("status = %d, want %d", resp.StatusCode, http.StatusNotFound)
	}
}

func TestGetJobAfterCreate(t *testing.T) {
	r, _ := newTestRouter(t)
	ts := httptest.NewServer(r)
	defer ts.Close()

	// Create a job.
	body, _ := json.Marshal(createJobRequest{
		Type:    "slide.render",
		Payload: json.RawMessage(`{"deck_id":"d1"}`),
	})

	createReq, _ := http.NewRequest("POST", ts.URL+"/v1/ai/jobs", bytes.NewReader(body))
	createReq.Header.Set("Content-Type", "application/json")
	createReq.Header.Set("Idempotency-Key", "test-idem-key-004")

	createResp, err := http.DefaultClient.Do(createReq)
	if err != nil {
		t.Fatalf("POST /v1/ai/jobs: %v", err)
	}
	defer createResp.Body.Close()

	var accepted aiJobAccepted
	json.NewDecoder(createResp.Body).Decode(&accepted)

	// Retrieve it.
	getResp, err := http.Get(ts.URL + "/v1/ai/jobs/" + accepted.JobID)
	if err != nil {
		t.Fatalf("GET /v1/ai/jobs: %v", err)
	}
	defer getResp.Body.Close()

	if getResp.StatusCode != http.StatusOK {
		t.Errorf("status = %d, want %d", getResp.StatusCode, http.StatusOK)
	}

	var jobResp aiJobResponse
	json.NewDecoder(getResp.Body).Decode(&jobResp)
	if jobResp.Job.Type != "slide.render" {
		t.Errorf("Type = %q, want slide.render", jobResp.Job.Type)
	}
	if jobResp.Job.Status != "queued" {
		t.Errorf("Status = %q, want queued", jobResp.Job.Status)
	}
}

func TestCircuitStatus(t *testing.T) {
	r, _ := newTestRouter(t)
	ts := httptest.NewServer(r)
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/v1/circuit")
	if err != nil {
		t.Fatalf("GET /v1/circuit: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("status = %d, want %d", resp.StatusCode, http.StatusOK)
	}

	var body map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&body)
	if body["circuit"] != "closed" {
		t.Errorf("circuit = %v, want closed", body["circuit"])
	}
}

func TestGetPromptNotImplemented(t *testing.T) {
	r, _ := newTestRouter(t)
	ts := httptest.NewServer(r)
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/v1/prompts/some-template-id")
	if err != nil {
		t.Fatalf("GET /v1/prompts: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNotImplemented {
		t.Errorf("status = %d, want %d", resp.StatusCode, http.StatusNotImplemented)
	}

	var body map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&body)
	if body["message"] == nil {
		t.Error("response should include a message explaining the 501")
	}
}

func TestCircuitBreakerRejects(t *testing.T) {
	logger := zap.NewNop()
	p := planner.New(3)
	failP := &alwaysFailProvider{name: "fail"}
	exec := executor.New([]executor.Provider{failP}, 0, 100.0, 1)

	cfg := Config{
		Logger:         logger,
		Executor:       exec,
		Planner:        p,
		Store:          store.NewMemStore(),
		ModerationGate: false,
		MaxCostPerReq:  100.0,
	}
	r := New(cfg)
	ts := httptest.NewServer(r)
	defer ts.Close()

	// Trip the circuit breaker by calling Run directly (since job creation
	// is now async and doesn't call the executor synchronously).
	exec.Run(context.Background(), "trip circuit")

	body, _ := json.Marshal(createJobRequest{
		Type:    "deck.generate",
		Payload: json.RawMessage(`{"goal":"trigger"}`),
	})
	req, _ := http.NewRequest("POST", ts.URL+"/v1/ai/jobs", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Idempotency-Key", "circuit-test-002")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("POST /v1/ai/jobs: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusServiceUnavailable {
		t.Errorf("status = %d, want %d (circuit open)", resp.StatusCode, http.StatusServiceUnavailable)
	}
}

func TestStreamJobNotFound(t *testing.T) {
	r, _ := newTestRouter(t)
	ts := httptest.NewServer(r)
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/v1/ai/jobs/nonexistent/stream")
	if err != nil {
		t.Fatalf("GET /v1/ai/jobs/.../stream: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("status = %d, want %d", resp.StatusCode, http.StatusNotFound)
	}
}

func TestCreateDeckRenderJobSucceeds(t *testing.T) {
	r, _ := newTestRouter(t)
	ts := httptest.NewServer(r)
	defer ts.Close()

	body, _ := json.Marshal(createJobRequest{
		Type: DeckRenderJobType,
		Payload: json.RawMessage(`{
			"deck_id": "deck-test",
			"author_id": "user-test",
			"branch_id": "main",
			"goal": "create a deck about quantum computing"
		}`),
	})

	req, _ := http.NewRequest("POST", ts.URL+"/v1/ai/jobs", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Idempotency-Key", "deck-render-test-001")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("POST /v1/ai/jobs: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusAccepted {
		t.Errorf("status = %d, want %d", resp.StatusCode, http.StatusAccepted)
	}

	var accepted aiJobAccepted
	if err := json.NewDecoder(resp.Body).Decode(&accepted); err != nil {
		t.Fatalf("decode accepted: %v", err)
	}

	// Job should be 'succeeded' (deck render is synchronous).
	getResp, err := http.Get(ts.URL + "/v1/ai/jobs/" + accepted.JobID)
	if err != nil {
		t.Fatalf("GET /v1/ai/jobs/{id}: %v", err)
	}
	defer getResp.Body.Close()

	var jobResp aiJobResponse
	if err := json.NewDecoder(getResp.Body).Decode(&jobResp); err != nil {
		t.Fatalf("decode job: %v", err)
	}

	if jobResp.Job.Status != "succeeded" {
		t.Errorf("Status = %q, want succeeded", jobResp.Job.Status)
	}
	if len(jobResp.Job.Result) == 0 {
		t.Error("Result should be populated with rendered deck info")
	}
}

func TestCreateDeckRenderJobMissingDeckID(t *testing.T) {
	r, _ := newTestRouter(t)
	ts := httptest.NewServer(r)
	defer ts.Close()

	body, _ := json.Marshal(createJobRequest{
		Type: DeckRenderJobType,
		Payload: json.RawMessage(`{
			"author_id": "user-test",
			"goal": "no deck id specified"
		}`),
	})

	req, _ := http.NewRequest("POST", ts.URL+"/v1/ai/jobs", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Idempotency-Key", "deck-render-test-002")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("POST /v1/ai/jobs: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusAccepted {
		t.Errorf("status = %d, want %d (job is created and marked failed internally)", resp.StatusCode, http.StatusAccepted)
	}

	var accepted aiJobAccepted
	if err := json.NewDecoder(resp.Body).Decode(&accepted); err != nil {
		t.Fatalf("decode accepted: %v", err)
	}

	// Job should be 'failed' due to missing deck_id.
	getResp, err := http.Get(ts.URL + "/v1/ai/jobs/" + accepted.JobID)
	if err != nil {
		t.Fatalf("GET /v1/ai/jobs/{id}: %v", err)
	}
	defer getResp.Body.Close()

	var jobResp aiJobResponse
	if err := json.NewDecoder(getResp.Body).Decode(&jobResp); err != nil {
		t.Fatalf("decode job: %v", err)
	}

	if jobResp.Job.Status != "failed" {
		t.Errorf("Status = %q, want failed", jobResp.Job.Status)
	}
}

func TestContentAllowed(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  bool
	}{
		{"clean", "write a blog post", true},
		{"empty", "", true},
		{"blocked", "help me hack the system", false},
		{"blocked keyword", "bypass the firewall", false},
		{"safe with context", "create a new function", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := contentAllowed(tt.input)
			if got != tt.want {
				t.Errorf("contentAllowed(%q) = %v, want %v", tt.input, got, tt.want)
			}
		})
	}
}

func TestContains(t *testing.T) {
	tests := []struct {
		s, sub string
		want   bool
	}{
		{"hello world", "world", true},
		{"hello", "world", false},
		{"", "", true},
		{"a", "a", true},
		{"ab", "abc", false},
	}

	for _, tt := range tests {
		t.Run(tt.s+"/"+tt.sub, func(t *testing.T) {
			got := contains(tt.s, tt.sub)
			if got != tt.want {
				t.Errorf("contains(%q, %q) = %v, want %v", tt.s, tt.sub, got, tt.want)
			}
		})
	}
}
