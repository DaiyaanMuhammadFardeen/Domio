// Package httpapi wires the HTTP routes for the benchmark service.
//
// Endpoints:
//
//   POST   /v1/benchmarks                       — register
//   GET    /v1/benchmarks                       — list
//   GET    /v1/benchmarks/{id}                  — fetch one
//   POST   /v1/benchmarks/{id}/archive          — archive
//   POST   /v1/benchmarks/{id}/sign             — return the signature
//   POST   /v1/benchmarks/{id}/snapshots        — ingest a snapshot (HMAC-protected)
//   POST   /v1/benchmarks/{id}/infer            — run inference
//   GET    /healthz                             — liveness
//   GET    /readyz                              — readiness
//
// All /v1 routes use the X-Workspace-Id header as the tenant
// boundary. The HMAC-protected ingest endpoint requires an
// X-Benchmark-Signature header that matches HMAC-SHA256(body) where
// the key is BENCHMARK_INGEST_KEY.
package httpapi

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/domio/platform/services/benchmark/internal/hmac"
	"github.com/domio/platform/services/benchmark/internal/inference"
	"github.com/domio/platform/services/benchmark/internal/model"
	"github.com/domio/platform/services/benchmark/internal/registry"
	"github.com/domio/platform/services/benchmark/internal/store"
)

// Server holds the dependencies wired by main.go.
type Server struct {
	Registry *registry.Service
	Store    store.Store
	Now      func() time.Time
}

// Routes returns the chi router.
func (s *Server) Routes() http.Handler {
	if s.Now == nil {
		s.Now = time.Now
	}
	r := chi.NewRouter()
	r.Get("/healthz", s.health)
	r.Get("/readyz", s.ready)
	r.Route("/v1/benchmarks", func(r chi.Router) {
		r.Get("/", s.list)
		r.Post("/", s.create)
		r.Route("/{id}", func(r chi.Router) {
			r.Get("/", s.get)
			r.Post("/archive", s.archive)
			r.Post("/sign", s.sign)
			r.Post("/snapshots", s.snapshot)
			r.Post("/infer", s.infer)
		})
	})
	return r
}

func (s *Server) health(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("content-type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok", "service": "benchmark"})
}

func (s *Server) ready(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("content-type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"status":             "ready",
		"signing_key_set":    hmac.SigningKeyConfigured(),
	})
}

// CreateRequest is the POST body for /v1/benchmarks.
type CreateRequest struct {
	WorkspaceID  string                 `json:"workspace_id"`
	Name         string                 `json:"name"`
	Description  string                 `json:"description,omitempty"`
	MetricName   string                 `json:"metric_name"`
	VariantAKey  string                 `json:"variant_a_key"`
	VariantBKey  string                 `json:"variant_b_key"`
	Method       string                 `json:"method,omitempty"`
	ChainPrev    string                 `json:"chain_prev,omitempty"`
	Metadata     map[string]interface{} `json:"metadata,omitempty"`
}

func (s *Server) create(w http.ResponseWriter, r *http.Request) {
	var req CreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid json")
		return
	}
	if req.WorkspaceID == "" {
		req.WorkspaceID = r.Header.Get("X-Workspace-Id")
	}
	ws, err := uuid.Parse(req.WorkspaceID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "workspace_id must be a UUID")
		return
	}
	b := model.Benchmark{
		WorkspaceID: ws,
		Name:        req.Name,
		Description: req.Description,
		MetricName:  req.MetricName,
		VariantAKey: req.VariantAKey,
		VariantBKey: req.VariantBKey,
		Method:      model.InferenceMethod(req.Method),
	}
	if req.ChainPrev != "" {
		cp, err := uuid.Parse(req.ChainPrev)
		if err != nil {
			writeError(w, http.StatusBadRequest, "bad_request", "chain_prev must be a UUID")
			return
		}
		b.ChainPrev = &cp
	}
	out, err := s.Registry.Register(r.Context(), b)
	if err != nil {
		if errors.Is(err, registry.ErrInvalidPayload) {
			writeError(w, http.StatusBadRequest, "bad_request", err.Error())
			return
		}
		if errors.Is(err, store.ErrConflict) {
			writeError(w, http.StatusConflict, "conflict", "benchmark_id or name already exists")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal_error", err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]interface{}{"benchmark": out})
}

func (s *Server) list(w http.ResponseWriter, r *http.Request) {
	ws, ok := requireWorkspace(w, r)
	if !ok {
		return
	}
	f := model.BenchmarkFilter{WorkspaceID: ws}
	list, err := s.Registry.List(r.Context(), f)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"benchmarks": list})
}

func (s *Server) get(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	ws, ok := requireWorkspace(w, r)
	if !ok {
		return
	}
	b, err := s.Registry.Get(r.Context(), ws, id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "not_found", "benchmark not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal_error", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"benchmark": b})
}

func (s *Server) archive(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	ws, ok := requireWorkspace(w, r)
	if !ok {
		return
	}
	b, err := s.Registry.Archive(r.Context(), ws, id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "not_found", "benchmark not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal_error", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"benchmark": b})
}

func (s *Server) sign(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	ws, ok := requireWorkspace(w, r)
	if !ok {
		return
	}
	b, err := s.Registry.Get(r.Context(), ws, id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "not_found", "benchmark not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal_error", err.Error())
		return
	}
	sig, err := s.Registry.SignPayload(b)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"signature": sig})
}

// SnapshotRequest is the POST body for /v1/benchmarks/{id}/snapshots.
type SnapshotRequest struct {
	WorkspaceID  string  `json:"workspace_id"`
	MetricName   string  `json:"metric_name"`
	BucketDate   string  `json:"bucket_date"` // YYYY-MM-DD
	Value        float64 `json:"value"`
	SampleSize   uint32  `json:"sample_size"`
	RegionPinned string  `json:"region_pinned,omitempty"`
}

func (s *Server) snapshot(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	// Read the body fully so we can both verify HMAC and decode it.
	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "read body")
		return
	}
	sig := r.Header.Get("X-Benchmark-Signature")
	if sig == "" {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing X-Benchmark-Signature")
		return
	}
	if err := hmac.Verify(body, sig); err != nil {
		writeError(w, http.StatusUnauthorized, "unauthorized", err.Error())
		return
	}
	var req SnapshotRequest
	if err := json.NewDecoder(bytes.NewReader(body)).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid json")
		return
	}
	if req.WorkspaceID == "" {
		req.WorkspaceID = r.Header.Get("X-Workspace-Id")
	}
	ws, err := uuid.Parse(req.WorkspaceID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "workspace_id must be a UUID")
		return
	}
	// Load the benchmark to validate ownership.
	b, err := s.Registry.Get(r.Context(), ws, id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "not_found", "benchmark not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal_error", err.Error())
		return
	}
	day, err := time.Parse("2006-01-02", req.BucketDate)
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "bucket_date must be YYYY-MM-DD")
		return
	}
	snap := model.BenchmarkSnapshot{
		WorkspaceID:  ws,
		BenchmarkID:  b.BenchmarkID,
		MetricName:   req.MetricName,
		BucketDate:   day,
		Value:        req.Value,
		SampleSize:   req.SampleSize,
		RegionPinned: req.RegionPinned,
		UpdatedAt:    s.Now().UTC(),
	}
	if err := s.Store.WriteSnapshot(r.Context(), snap); err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]interface{}{"snapshot": snap})
}

// InferRequest is the POST body for /v1/benchmarks/{id}/infer.
type InferRequest struct {
	WorkspaceID string                  `json:"workspace_id"`
	Method      string                  `json:"method,omitempty"`
	SampleA     []float64               `json:"sample_a"`
	SampleB     []float64               `json:"sample_b"`
	Metadata    map[string]interface{}  `json:"metadata,omitempty"`
}

func (s *Server) infer(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	var req InferRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid json")
		return
	}
	if req.WorkspaceID == "" {
		req.WorkspaceID = r.Header.Get("X-Workspace-Id")
	}
	ws, err := uuid.Parse(req.WorkspaceID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "workspace_id must be a UUID")
		return
	}
	b, err := s.Registry.Get(r.Context(), ws, id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "not_found", "benchmark not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal_error", err.Error())
		return
	}
	method := model.InferenceMethod(req.Method)
	if method == "" {
		method = b.Method
	}
	res, err := inference.Infer(req.SampleA, req.SampleB, method)
	if err != nil {
		if errors.Is(err, inference.ErrInsufficientSamples) {
			writeError(w, http.StatusBadRequest, "bad_request", "both samples must be non-empty")
			return
		}
		if errors.Is(err, inference.ErrUnknownMethod) {
			writeError(w, http.StatusBadRequest, "bad_request", err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "internal_error", err.Error())
		return
	}
	run := model.BenchmarkRun{
		RunID:       uuid.New(),
		WorkspaceID: ws,
		BenchmarkID: b.BenchmarkID,
		Method:      method,
		SampleSizeA: len(req.SampleA),
		SampleSizeB: len(req.SampleB),
		Result:      res,
		ComputedAt:  s.Now().UTC(),
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"run": run})
}

func parseID(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id must be a UUID")
		return uuid.Nil, false
	}
	return id, true
}

func requireWorkspace(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	ws := r.Header.Get("X-Workspace-Id")
	if ws == "" {
		writeError(w, http.StatusBadRequest, "bad_request", "missing X-Workspace-Id")
		return uuid.Nil, false
	}
	id, err := uuid.Parse(ws)
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "X-Workspace-Id must be a UUID")
		return uuid.Nil, false
	}
	return id, true
}

func writeJSON(w http.ResponseWriter, status int, body interface{}) {
	w.Header().Set("content-type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]map[string]string{
		"error": {"code": code, "message": message},
	})
}