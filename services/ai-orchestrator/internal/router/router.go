// Package router sets up the chi HTTP router for the AI orchestrator service.
//
// It exposes REST endpoints aligned to contracts/openapi/v1/ai.yaml:
//   - POST /v1/ai/jobs — create a job (async, 202 Accepted)
//   - GET  /v1/ai/jobs/{job_id} — job status/details
//   - GET  /v1/ai/jobs/{job_id}/stream — SSE event stream
//   - GET  /v1/prompts/{template_id} — proxy to adapter (501 stub)
//   - GET  /healthz, /readyz, /metrics
//
// It enforces cost caps, a circuit breaker, an optional content-moderation
// gate, and idempotency via UNIQUE(workspace_id, idempotency_key).
package router

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"go.uber.org/zap"

	"github.com/domio/platform/services/ai-orchestrator/internal/adapterclient"
	"github.com/domio/platform/services/ai-orchestrator/internal/copy"
	"github.com/domio/platform/services/ai-orchestrator/internal/designer"
	"github.com/domio/platform/services/ai-orchestrator/internal/executor"
	"github.com/domio/platform/services/ai-orchestrator/internal/image"
	"github.com/domio/platform/services/ai-orchestrator/internal/planner"
	"github.com/domio/platform/services/ai-orchestrator/internal/redesign"
	"github.com/domio/platform/services/ai-orchestrator/internal/renderer"
	"github.com/domio/platform/services/ai-orchestrator/internal/store"
)

// Config holds the dependencies for the router.
type Config struct {
	Logger         *zap.Logger
	Executor       *executor.Executor
	Planner        *planner.Planner
	Store          store.Store // job persistence
	Renderer       *renderer.DeckRenderer
	AdapterClient  adapterclient.Client
	Designer       *designer.Designer
	Redesigner     *redesign.Redesigner
	CopyAssistant  *copy.CopyAssistant
	ImageService   *image.ImageService
	ModerationGate bool
	MaxCostPerReq  float64
}

// Deck render job type identifier. When POST /v1/ai/jobs is submitted with
// `type = "deck_render"`, the router expands the payload into a full
// outline via the planner + adapter's prompt registry, then delegates to
// the renderer to persist a new deck version + slides.
const DeckRenderJobType = "deck_render"

// renderJobPayload is the JSON body for `type = "deck_render"` jobs.
type renderJobPayload struct {
	DeckID     string `json:"deck_id"`
	AuthorID   string `json:"author_id"`
	BranchID   string `json:"branch_id,omitempty"`
	Goal       string `json:"goal"`
	TemplateID string `json:"template_id,omitempty"`
}

// ---------------------------------------------------------------------------
// Request / response types (aligned to ai.yaml schemas)
// ---------------------------------------------------------------------------

// createJobRequest is the JSON body for POST /v1/ai/jobs.
type createJobRequest struct {
	Type      string          `json:"type"`
	Payload   json.RawMessage `json:"payload"`
	Workspace string          `json:"workspace_id,omitempty"`
}

// aiJobAccepted is the 202 response for job creation.
type aiJobAccepted struct {
	JobID     string `json:"job_id"`
	Status    string `json:"status"`
	StreamURL string `json:"stream_url"`
	TraceID   string `json:"trace_id,omitempty"`
}

// aiJobResponse wraps a single job for GET responses.
type aiJobResponse struct {
	Job     aiJobJSON `json:"job"`
	TraceID string    `json:"trace_id,omitempty"`
}

// aiJobJSON is the JSON shape returned to clients (aligned to the OpenAPI AiJob schema).
type aiJobJSON struct {
	ID             string          `json:"id"`
	WorkspaceID    string          `json:"workspace_id"`
	RequestedBy    string          `json:"requested_by,omitempty"`
	IdempotencyKey string          `json:"idempotency_key,omitempty"`
	Type           string          `json:"type"`
	Status         string          `json:"status"`
	Payload        json.RawMessage `json:"payload,omitempty"`
	Constraints    json.RawMessage `json:"constraints,omitempty"`
	Result         json.RawMessage `json:"result,omitempty"`
	Error          json.RawMessage `json:"error,omitempty"`
	CostCents      int32           `json:"cost_cents"`
	CreatedAt      string          `json:"created_at"`
	StartedAt      string          `json:"started_at,omitempty"`
	CompletedAt    string          `json:"completed_at,omitempty"`
}

// ---------------------------------------------------------------------------
// In-memory idempotency map (per workspace + key → existing job).
// This is used as a fast path; the DB unique constraint is the source of truth.
// ---------------------------------------------------------------------------

type idempotencyEntry struct {
	JobID string
}

type idempotencyStore struct {
	mu      sync.RWMutex
	entries map[string]idempotencyEntry // key = "workspace_id:idempotency_key"
}

var idemStore = &idempotencyStore{entries: make(map[string]idempotencyEntry)}

func (s *idempotencyStore) get(workspaceID, key string) (string, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	entry, ok := s.entries[workspaceID+":"+key]
	return entry.JobID, ok
}

func (s *idempotencyStore) set(workspaceID, key, jobID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.entries[workspaceID+":"+key] = idempotencyEntry{JobID: jobID}
}

// ---------------------------------------------------------------------------
// Moderation gate
// ---------------------------------------------------------------------------

var moderationBlocklists = []string{
	"hack", "exploit", "bypass",
}

func contentAllowed(text string) bool {
	if text == "" {
		return true
	}
	lower := text
	for _, word := range moderationBlocklists {
		if contains(lower, word) {
			return false
		}
	}
	return true
}

func contains(s, sub string) bool {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

// New creates and returns a configured chi router with all spec-aligned routes.
func New(cfg Config) chi.Router {
	r := chi.NewRouter()

	// Global middleware.
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Heartbeat("/healthz"))

	// Health endpoints.
	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	r.Get("/readyz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	// API routes — aligned to contracts/openapi/v1/ai.yaml.
	r.Route("/v1", func(r chi.Router) {
		// Jobs
		r.Post("/ai/jobs", handleCreateJob(cfg))
		r.Get("/ai/jobs/{job_id}", handleGetJob(cfg))
		r.Get("/ai/jobs/{job_id}/stream", handleStreamJob(cfg))

		// Prompts (proxy to adapter, 501 stub until client is wired)
		r.Get("/prompts/{template_id}", handleGetPrompt(cfg))

		// Circuit status (retained for ops visibility)
		r.Get("/circuit", handleCircuitStatus(cfg))

		// M2 features
		r.Post("/ai/designer", handleDesigner(cfg))
		r.Post("/ai/designer/more-like", handleDesignerMoreLike(cfg))
		r.Post("/ai/redesign", handleRedesign(cfg))
		r.Post("/ai/copy", handleCopy(cfg))
		r.Post("/ai/image", handleImageGenerate(cfg))
		r.Post("/ai/image/{id}/remove-background", handleImageRemoveBackground(cfg))
	})

	return r
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

func handleCreateJob(cfg Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req createJobRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]interface{}{
				"code":    "invalid_argument",
				"message": "invalid request body",
			})
			return
		}

		if req.Type == "" {
			writeJSON(w, http.StatusBadRequest, map[string]interface{}{
				"code":    "required",
				"message": "type is required",
			})
			return
		}

		if len(req.Payload) == 0 || string(req.Payload) == "null" {
			writeJSON(w, http.StatusBadRequest, map[string]interface{}{
				"code":    "required",
				"message": "payload is required",
			})
			return
		}

		idempotencyKey := r.Header.Get("Idempotency-Key")
		if idempotencyKey == "" {
			writeJSON(w, http.StatusBadRequest, map[string]interface{}{
				"code":    "required",
				"message": "Idempotency-Key header is required",
			})
			return
		}

		workspaceID := req.Workspace
		if workspaceID == "" {
			workspaceID = "default"
		}

		// Moderation gate.
		if cfg.ModerationGate && !contentAllowed(string(req.Payload)) {
			cfg.Logger.Warn("moderation: content blocked")
			writeJSON(w, http.StatusForbidden, map[string]interface{}{
				"code":    "forbidden",
				"message": "content blocked by moderation policy",
			})
			return
		}

		// Check circuit breaker.
		if cfg.Executor.CircuitState_() == executor.CircuitOpen {
			writeJSON(w, http.StatusServiceUnavailable, map[string]interface{}{
				"code":    "unavailable",
				"message": "service temporarily unavailable (circuit breaker open)",
			})
			return
		}

		// Check cost cap.
		if cfg.Executor.TotalCost()+cfg.MaxCostPerReq > cfg.MaxCostPerReq*100 {
			writeJSON(w, http.StatusTooManyRequests, map[string]interface{}{
				"code":    "rate_limited",
				"message": "cost limit approaching; try again later",
			})
			return
		}

		// Idempotency check — if same workspace+key already exists, return existing job (409).
		if existingJobID, ok := idemStore.get(workspaceID, idempotencyKey); ok {
			cfg.Logger.Info("idempotency hit",
				zap.String("job_id", existingJobID),
				zap.String("idempotency_key", idempotencyKey))
			existing, err := cfg.Store.GetJob(r.Context(), existingJobID)
			if err != nil {
				writeJSON(w, http.StatusConflict, map[string]interface{}{
					"code":    "idempotency_key_conflict",
					"message": "job already exists but could not be retrieved",
				})
				return
			}
			writeJSON(w, http.StatusConflict, map[string]interface{}{
				"code":    "idempotency_key_conflict",
				"message": "job already exists",
				"job_id":  existing.ID,
				"status":  string(existing.Status),
			})
			return
		}

		// Create job via store.
		jobID := generateUUID()
		now := time.Now().UTC()
		job := &store.Job{
			ID:             jobID,
			WorkspaceID:    workspaceID,
			RequestedBy:    "",
			IdempotencyKey: idempotencyKey,
			JobType:        req.Type,
			Status:         store.StatusQueued,
			Payload:        req.Payload,
			Constraints:    json.RawMessage(`{}`),
			CostCents:      0,
			CreatedAt:      now,
			UpdatedAt:      now,
		}

		if err := cfg.Store.CreateJob(r.Context(), job); err != nil {
			cfg.Logger.Error("create job failed", zap.Error(err))
			writeJSON(w, http.StatusInternalServerError, map[string]interface{}{
				"code":    "internal",
				"message": "failed to create job",
			})
			return
		}

		idemStore.set(workspaceID, idempotencyKey, jobID)

		cfg.Logger.Info("job created",
			zap.String("job_id", jobID),
			zap.String("type", req.Type),
			zap.String("workspace", workspaceID))

		// If the job is a deck render, kick off the planner + renderer
		// synchronously. Other job types are async-only and rely on the
		// external worker pool.
		if req.Type == DeckRenderJobType {
			if err := runDeckRender(r.Context(), cfg, job); err != nil {
				cfg.Logger.Error("deck render failed",
					zap.String("job_id", jobID), zap.Error(err))
				// We don't fail the HTTP response — the job is in store
				// and operators can inspect it. The job status will be
				// 'failed' and the error is captured in job.Error.
			}
		}

		writeJSON(w, http.StatusAccepted, aiJobAccepted{
			JobID:     jobID,
			Status:    "queued",
			StreamURL: fmt.Sprintf("/v1/ai/jobs/%s/stream", jobID),
		})
	}
}

// runDeckRender executes the planner → outline → renderer pipeline for a
// "deck_render" job. The job's status is updated in place; on success
// the rendered deck revision and slide IDs are returned in the result.
func runDeckRender(ctx context.Context, cfg Config, job *store.Job) error {
	var p renderJobPayload
	if err := json.Unmarshal(job.Payload, &p); err != nil {
		jobErr := json.RawMessage(fmt.Sprintf(`{"code":"invalid_argument","message":"%s"}`, err.Error()))
		_ = cfg.Store.MarkJobFailed(ctx, job.ID, jobErr)
		return fmt.Errorf("runDeckRender: parse payload: %w", err)
	}
	if p.DeckID == "" || p.AuthorID == "" {
		jobErr := json.RawMessage(`{"code":"required","message":"deck_id and author_id are required"}`)
		_ = cfg.Store.MarkJobFailed(ctx, job.ID, jobErr)
		return fmt.Errorf("runDeckRender: deck_id and author_id required")
	}
	if cfg.Renderer == nil {
		jobErr := json.RawMessage(`{"code":"unavailable","message":"renderer not wired"}`)
		_ = cfg.Store.MarkJobFailed(ctx, job.ID, jobErr)
		return fmt.Errorf("runDeckRender: renderer not wired")
	}

	// Transition to running.
	if err := cfg.Store.MarkJobRunning(ctx, job.ID); err != nil {
		return fmt.Errorf("runDeckRender: mark running: %w", err)
	}

	// Plan + outline.
	plan, err := cfg.Planner.Decompose(ctx, p.Goal, 0)
	if err != nil {
		jobErr := json.RawMessage(fmt.Sprintf(`{"code":"planner_error","message":"%s"}`, err.Error()))
		_ = cfg.Store.MarkJobFailed(ctx, job.ID, jobErr)
		return fmt.Errorf("runDeckRender: plan: %w", err)
	}

	var fetcher planner.PromptFetcher
	if cfg.AdapterClient != nil {
		fetcher = promptFetcherAdapter{client: cfg.AdapterClient}
	}
	outline, err := planner.BuildOutline(ctx, fetcher, p.TemplateID, plan)
	if err != nil || outline == nil {
		// Fallback: build a minimal outline from the plan.
		outline = &planner.Outline{}
		for _, st := range plan.Subtasks {
			outline.Slides = append(outline.Slides, planner.OutlineSlide{
				Intent:        st.Title,
				LayoutHint:    "content",
				ContentBlocks: []string{st.Description},
			})
		}
	}

	// Render.
	renderResult, err := cfg.Renderer.Render(ctx, renderer.RenderRequest{
		DeckID:     p.DeckID,
		AuthorID:   p.AuthorID,
		BranchID:   p.BranchID,
		Outline:    outline,
		ChangeDesc: fmt.Sprintf("auto-render from goal: %s", p.Goal),
	})
	if err != nil {
		jobErr := json.RawMessage(fmt.Sprintf(`{"code":"render_error","message":"%s"}`, err.Error()))
		_ = cfg.Store.MarkJobFailed(ctx, job.ID, jobErr)
		return fmt.Errorf("runDeckRender: render: %w", err)
	}

	// Persist the result.
	resultJSON, err := json.Marshal(map[string]interface{}{
		"deck_id":  renderResult.DeckID,
		"revision": renderResult.Revision,
		"slide_ids": renderResult.SlideIDs,
	})
	if err != nil {
		return fmt.Errorf("runDeckRender: marshal result: %w", err)
	}
	if err := cfg.Store.MarkJobSucceeded(ctx, job.ID, resultJSON); err != nil {
		return fmt.Errorf("runDeckRender: mark succeeded: %w", err)
	}
	return nil
}

// promptFetcherAdapter adapts adapterclient.Client to the planner.PromptFetcher
// interface so the outline builder can pull prompt templates.
type promptFetcherAdapter struct {
	client adapterclient.Client
}

func (p promptFetcherAdapter) GetPrompt(ctx context.Context, templateID string, version int32) (*adapterclient.PromptTemplate, error) {
	return p.client.GetPrompt(ctx, templateID, version)
}

func handleGetJob(cfg Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		jobID := chi.URLParam(r, "job_id")

		job, err := cfg.Store.GetJob(r.Context(), jobID)
		if err != nil {
			writeJSON(w, http.StatusNotFound, map[string]interface{}{
				"code":    "not_found",
				"message": "job not found",
			})
			return
		}

		resp := aiJobResponse{
			Job: aiJobJSON{
				ID:             job.ID,
				WorkspaceID:    job.WorkspaceID,
				RequestedBy:    job.RequestedBy,
				IdempotencyKey: job.IdempotencyKey,
				Type:           job.JobType,
				Status:         string(job.Status),
				Payload:        job.Payload,
				Constraints:    job.Constraints,
				Result:         job.Result,
				Error:          job.Error,
				CostCents:      job.CostCents,
				CreatedAt:      job.CreatedAt.Format(time.RFC3339),
			},
		}
		if job.StartedAt != nil {
			resp.Job.StartedAt = job.StartedAt.Format(time.RFC3339)
		}
		if job.CompletedAt != nil {
			resp.Job.CompletedAt = job.CompletedAt.Format(time.RFC3339)
		}

		writeJSON(w, http.StatusOK, resp)
	}
}

func handleStreamJob(cfg Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		jobID := chi.URLParam(r, "job_id")

		// Verify job exists.
		job, err := cfg.Store.GetJob(r.Context(), jobID)
		if err != nil {
			writeJSON(w, http.StatusNotFound, map[string]interface{}{
				"code":    "not_found",
				"message": "job not found",
			})
			return
		}

		// Set SSE headers.
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		w.WriteHeader(http.StatusOK)

		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "streaming not supported", http.StatusInternalServerError)
			return
		}

		// Send initial status event.
		fmt.Fprintf(w, "event: status\ndata: {\"status\":\"%s\",\"job_id\":\"%s\"}\n\n", string(job.Status), jobID)
		flusher.Flush()

		// If the job is already terminal, send done and return.
		if job.Status == store.StatusSucceeded {
			fmt.Fprintf(w, "event: done\ndata: {\"job_id\":\"%s\"}\n\n", jobID)
			flusher.Flush()
			return
		}
		if job.Status == store.StatusFailed {
			fmt.Fprintf(w, "event: error\ndata: %s\n\n", string(job.Error))
			flusher.Flush()
			return
		}

		// For running/queued jobs, poll until complete or client disconnects.
		ticker := time.NewTicker(500 * time.Millisecond)
		defer ticker.Stop()

		for {
			select {
			case <-r.Context().Done():
				return
			case <-ticker.C:
				job, err = cfg.Store.GetJob(r.Context(), jobID)
				if err != nil {
					return
				}

				fmt.Fprintf(w, "event: status\ndata: {\"status\":\"%s\"}\n\n", string(job.Status))
				flusher.Flush()

				if job.Status == store.StatusSucceeded {
					if job.Result != nil {
						fmt.Fprintf(w, "event: artifact\ndata: %s\n\n", string(job.Result))
						flusher.Flush()
					}
					fmt.Fprintf(w, "event: done\ndata: {\"job_id\":\"%s\"}\n\n", jobID)
					flusher.Flush()
					return
				}
				if job.Status == store.StatusFailed {
					fmt.Fprintf(w, "event: error\ndata: %s\n\n", string(job.Error))
					flusher.Flush()
					return
				}
			}
		}
	}
}

func handleGetPrompt(cfg Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Prompt template proxy is not yet wired to the adapter service.
		// Return 501 with a clear message per spec requirement.
		writeJSON(w, http.StatusNotImplemented, map[string]interface{}{
			"code":    "unavailable",
			"message": "prompt template proxy not yet implemented; will be wired to the adapter gRPC service (GetPrompt RPC) in P2-L1",
		})
	}
}

func handleCircuitStatus(cfg Config) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		state := cfg.Executor.CircuitState_()
		stateStr := "closed"
		switch state {
		case executor.CircuitOpen:
			stateStr = "open"
		case executor.CircuitHalfOpen:
			stateStr = "half_open"
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"circuit":    stateStr,
			"total_cost": cfg.Executor.TotalCost(),
		})
	}
}

// ---------------------------------------------------------------------------
// M2 feature handlers (#111–#114)
// ---------------------------------------------------------------------------

// handleDesigner implements POST /v1/ai/designer (feature #111).
//
// Body: designer.SlidePrompt. Returns 4 distinct layout options.
func handleDesigner(cfg Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if cfg.Designer == nil {
			writeJSON(w, http.StatusNotImplemented, map[string]interface{}{
				"code":    "unavailable",
				"message": "designer not wired",
			})
			return
		}
		var req designer.SlidePrompt
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]interface{}{
				"code":    "invalid_argument",
				"message": "invalid request body",
			})
			return
		}
		res, err := cfg.Designer.Design(r.Context(), req)
		if err != nil {
			cfg.Logger.Error("designer", zap.Error(err))
			writeJSON(w, http.StatusInternalServerError, map[string]interface{}{
				"code":    "designer_error",
				"message": err.Error(),
			})
			return
		}
		writeJSON(w, http.StatusOK, res)
	}
}

// handleDesignerMoreLike implements POST /v1/ai/designer/more-like.
// Body: { "seed": designer.LayoutOption, "prompt": designer.SlidePrompt }.
func handleDesignerMoreLike(cfg Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if cfg.Designer == nil {
			writeJSON(w, http.StatusNotImplemented, map[string]interface{}{
				"code":    "unavailable",
				"message": "designer not wired",
			})
			return
		}
		var body struct {
			Seed   designer.LayoutOption  `json:"seed"`
			Prompt designer.SlidePrompt   `json:"prompt"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]interface{}{
				"code":    "invalid_argument",
				"message": "invalid request body",
			})
			return
		}
		res, err := cfg.Designer.MoreLike(r.Context(), body.Seed, body.Prompt)
		if err != nil {
			cfg.Logger.Error("designer more-like", zap.Error(err))
			writeJSON(w, http.StatusInternalServerError, map[string]interface{}{
				"code":    "designer_error",
				"message": err.Error(),
			})
			return
		}
		writeJSON(w, http.StatusOK, res)
	}
}

// handleRedesign implements POST /v1/ai/redesign (feature #112).
// Body: { "slide": redesign.SlideInput, "mode": "light"|"full" }.
func handleRedesign(cfg Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if cfg.Redesigner == nil {
			writeJSON(w, http.StatusNotImplemented, map[string]interface{}{
				"code":    "unavailable",
				"message": "redesigner not wired",
			})
			return
		}
		var body struct {
			Slide redesign.SlideInput `json:"slide"`
			Mode  redesign.Mode       `json:"mode"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]interface{}{
				"code":    "invalid_argument",
				"message": "invalid request body",
			})
			return
		}
		opt, err := cfg.Redesigner.Redesign(r.Context(), body.Slide, body.Mode)
		if err != nil {
			cfg.Logger.Error("redesign", zap.Error(err))
			writeJSON(w, http.StatusInternalServerError, map[string]interface{}{
				"code":    "redesign_error",
				"message": err.Error(),
			})
			return
		}
		writeJSON(w, http.StatusOK, opt)
	}
}

// handleCopy implements POST /v1/ai/copy (feature #113).
// Body: copy.CopyRequest.
func handleCopy(cfg Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if cfg.CopyAssistant == nil {
			writeJSON(w, http.StatusNotImplemented, map[string]interface{}{
				"code":    "unavailable",
				"message": "copy assistant not wired",
			})
			return
		}
		var req copy.CopyRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]interface{}{
				"code":    "invalid_argument",
				"message": "invalid request body",
			})
			return
		}
		res, err := cfg.CopyAssistant.Apply(r.Context(), req)
		if err != nil {
			cfg.Logger.Error("copy", zap.Error(err))
			writeJSON(w, http.StatusInternalServerError, map[string]interface{}{
				"code":    "copy_error",
				"message": err.Error(),
			})
			return
		}
		writeJSON(w, http.StatusOK, res)
	}
}

// handleImageGenerate implements POST /v1/ai/image (feature #114 generate).
func handleImageGenerate(cfg Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if cfg.ImageService == nil {
			writeJSON(w, http.StatusNotImplemented, map[string]interface{}{
				"code":    "unavailable",
				"message": "image service not wired",
			})
			return
		}
		var req image.GenerateRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]interface{}{
				"code":    "invalid_argument",
				"message": "invalid request body",
			})
			return
		}
		res, err := cfg.ImageService.Generate(r.Context(), req)
		if err != nil {
			cfg.Logger.Error("image generate", zap.Error(err))
			writeJSON(w, http.StatusInternalServerError, map[string]interface{}{
				"code":    "image_error",
				"message": err.Error(),
			})
			return
		}
		writeJSON(w, http.StatusOK, res)
	}
}

// handleImageRemoveBackground implements POST /v1/ai/image/{id}/remove-background.
func handleImageRemoveBackground(cfg Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if cfg.ImageService == nil {
			writeJSON(w, http.StatusNotImplemented, map[string]interface{}{
				"code":    "unavailable",
				"message": "image service not wired",
			})
			return
		}
		var req image.RemoveBackgroundRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]interface{}{
				"code":    "invalid_argument",
				"message": "invalid request body",
			})
			return
		}
		res, err := cfg.ImageService.RemoveBackground(r.Context(), req)
		if err != nil {
			cfg.Logger.Error("image remove-background", zap.Error(err))
			writeJSON(w, http.StatusInternalServerError, map[string]interface{}{
				"code":    "image_error",
				"message": err.Error(),
			})
			return
		}
		writeJSON(w, http.StatusOK, res)
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func generateUUID() string {
	// Simple monotonic UUID-like ID for in-memory use.
	// Real UUIDs come from gen_random_uuid() in Postgres.
	return time.Now().UTC().Format("20060102150405.000000000")
}
