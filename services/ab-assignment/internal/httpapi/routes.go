// Package httpapi exposes the ab-assignment HTTP surface.
//
// Endpoints:
//
//   POST   /v1/experiments                       — create
//   GET    /v1/experiments                       — list
//   GET    /v1/experiments/{id}                  — fetch one
//   PATCH  /v1/experiments/{id}                  — partial update
//   POST   /v1/experiments/{id}/assign           — deterministic assignment
//   POST   /v1/experposures                      — record exposure
//   POST   /graphql                              — GraphQL endpoint
//
// All routes use workspace_id (UUID) as the tenant boundary; missing
// or mismatched workspace ids are 400.
package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/domio/platform/services/ab-assignment/internal/assigner"
	"github.com/domio/platform/services/ab-assignment/internal/graphql"
	"github.com/domio/platform/services/ab-assignment/internal/model"
	"github.com/domio/platform/services/ab-assignment/internal/store"
)

// Server holds the dependencies wired by main.go.
type Server struct {
	Assigner   *assigner.Assigner
	Store      store.Store
	GraphQL    *graphql.Schema
	Now        func() time.Time
}

// Routes returns a chi router with the ab-assignment HTTP surface.
func (s *Server) Routes() http.Handler {
	if s.Now == nil {
		s.Now = time.Now
	}
	r := chi.NewRouter()
	r.Get("/health", s.health)
	r.Route("/v1", func(r chi.Router) {
		r.Route("/experiments", func(r chi.Router) {
			r.Get("/", s.listExperiments)
			r.Post("/", s.createExperiment)
			r.Route("/{id}", func(r chi.Router) {
				r.Get("/", s.getExperiment)
				r.Patch("/", s.patchExperiment)
				r.Post("/assign", s.assign)
			})
		})
		r.Post("/exposures", s.recordExposure)
	})
	r.Post("/graphql", s.graphql)
	return r
}

func (s *Server) health(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("content-type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok", "service": "ab-assignment"})
}

func (s *Server) listExperiments(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := requireWorkspace(w, r)
	if !ok {
		return
	}
	tests, err := s.Store.ListTests(r.Context(), workspaceID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"experiments": tests})
}

// CreateExperimentRequest is the POST body.
type CreateExperimentRequest struct {
	WorkspaceID     string         `json:"workspace_id"`
	Name            string         `json:"name"`
	Description     string         `json:"description,omitempty"`
	Status          string         `json:"status,omitempty"`
	HashBasis       string         `json:"hash_basis,omitempty"`
	ExposureEvent   string         `json:"exposure_event"`
	ConversionEvent string         `json:"conversion_event"`
	MinSampleSize   int            `json:"min_sample_size,omitempty"`
	AlphaBudget     float64        `json:"alpha_budget,omitempty"`
	Variants        []CreateVariant `json:"variants"`
}

// CreateVariant is one entry in CreateExperimentRequest.
type CreateVariant struct {
	Key     string          `json:"key"`
	Weight  int             `json:"weight"`
	Payload json.RawMessage `json:"payload,omitempty"`
}

func (s *Server) createExperiment(w http.ResponseWriter, r *http.Request) {
	var req CreateExperimentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid json")
		return
	}
	if req.WorkspaceID == "" {
		req.WorkspaceID = r.Header.Get("X-Workspace-Id")
	}
	workspaceID, err := uuid.Parse(req.WorkspaceID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "workspace_id must be a UUID")
		return
	}
	if req.Name == "" || req.ExposureEvent == "" || req.ConversionEvent == "" {
		writeError(w, http.StatusBadRequest, "bad_request", "name, exposure_event, conversion_event are required")
		return
	}
	if len(req.Variants) == 0 {
		writeError(w, http.StatusBadRequest, "bad_request", "at least one variant required")
		return
	}
	hashBasis := model.HashBasis(req.HashBasis)
	if hashBasis == "" {
		hashBasis = model.HashBasisWorkspace
	}
	t := model.Test{
		WorkspaceID:     workspaceID,
		Name:            req.Name,
		Description:     req.Description,
		Status:          model.StatusDraft,
		HashBasis:       hashBasis,
		HashSalt:        uuid.New().String(),
		ExposureEvent:   req.ExposureEvent,
		ConversionEvent: req.ConversionEvent,
		MinSampleSize:   req.MinSampleSize,
		AlphaBudget:     req.AlphaBudget,
	}
	if t.MinSampleSize == 0 {
		t.MinSampleSize = 1000
	}
	if t.AlphaBudget == 0 {
		t.AlphaBudget = 0.05
	}
	t, err = s.Store.CreateTest(r.Context(), t)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", err.Error())
		return
	}
	variants := make([]model.Variant, 0, len(req.Variants))
	for _, v := range req.Variants {
		variants = append(variants, model.Variant{
			TestID:      t.TestID,
			WorkspaceID: workspaceID,
			VariantKey:  v.Key,
			Weight:      v.Weight,
			Payload:     v.Payload,
		})
	}
	for i := range variants {
		variants[i], err = s.Store.CreateVariant(r.Context(), variants[i])
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal_error", err.Error())
			return
		}
	}
	s.Assigner.InvalidateCache(t.TestID)
	writeJSON(w, http.StatusCreated, map[string]interface{}{"experiment": t, "variants": variants})
}

func (s *Server) getExperiment(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id must be a UUID")
		return
	}
	workspaceID, ok := requireWorkspace(w, r)
	if !ok {
		return
	}
	t, err := s.Store.GetTest(r.Context(), workspaceID, id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "not_found", "experiment not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal_error", err.Error())
		return
	}
	vs, err := s.Store.ListVariants(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"experiment": t, "variants": vs})
}

// PatchExperimentRequest allows partial updates to status, description, and metadata.
type PatchExperimentRequest struct {
	Status        *string         `json:"status,omitempty"`
	Description   *string         `json:"description,omitempty"`
	MinSampleSize *int            `json:"min_sample_size,omitempty"`
	AlphaBudget   *float64        `json:"alpha_budget,omitempty"`
	StartedAt     *time.Time      `json:"started_at,omitempty"`
	EndedAt       *time.Time      `json:"ended_at,omitempty"`
	Variants      *[]CreateVariant `json:"variants,omitempty"`
}

func (s *Server) patchExperiment(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id must be a UUID")
		return
	}
	workspaceID, ok := requireWorkspace(w, r)
	if !ok {
		return
	}
	var req PatchExperimentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid json")
		return
	}
	t, err := s.Store.GetTest(r.Context(), workspaceID, id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "not_found", "experiment not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal_error", err.Error())
		return
	}
	if req.Status != nil {
		t.Status = model.TestStatus(*req.Status)
		now := s.Now()
		if t.Status == model.StatusRunning && t.StartedAt == nil {
			t.StartedAt = &now
		}
		if t.Status == model.StatusConcluded && t.EndedAt == nil {
			t.EndedAt = &now
		}
	}
	if req.Description != nil {
		t.Description = *req.Description
	}
	if req.MinSampleSize != nil {
		t.MinSampleSize = *req.MinSampleSize
	}
	if req.AlphaBudget != nil {
		t.AlphaBudget = *req.AlphaBudget
	}
	if req.StartedAt != nil {
		t.StartedAt = req.StartedAt
	}
	if req.EndedAt != nil {
		t.EndedAt = req.EndedAt
	}
	if _, err := s.Store.UpdateTest(r.Context(), t); err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", err.Error())
		return
	}
	if req.Variants != nil {
		vs := make([]model.Variant, len(*req.Variants))
		for i, v := range *req.Variants {
			vs[i] = model.Variant{
				TestID:      id,
				WorkspaceID: workspaceID,
				VariantKey:  v.Key,
				Weight:      v.Weight,
				Payload:     v.Payload,
			}
		}
		if err := s.Store.ReplaceVariants(r.Context(), id, vs); err != nil {
			writeError(w, http.StatusInternalServerError, "internal_error", err.Error())
			return
		}
	}
	s.Assigner.InvalidateCache(id)
	writeJSON(w, http.StatusOK, map[string]interface{}{"experiment": t})
}

type assignRequest struct {
	WorkspaceID  string `json:"workspace_id"`
	ViewerIDKey  string `json:"viewer_id_key"`
}

func (s *Server) assign(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "id must be a UUID")
		return
	}
	var req assignRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid json")
		return
	}
	if req.WorkspaceID == "" {
		req.WorkspaceID = r.Header.Get("X-Workspace-Id")
	}
	workspaceID, err := uuid.Parse(req.WorkspaceID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "workspace_id must be a UUID")
		return
	}
	if req.ViewerIDKey == "" {
		writeError(w, http.StatusBadRequest, "bad_request", "viewer_id_key required")
		return
	}
	res, err := s.Assigner.Assign(r.Context(), workspaceID, id, req.ViewerIDKey)
	if err != nil {
		switch {
		case errors.Is(err, assigner.ErrTestNotRunning):
			writeError(w, http.StatusConflict, "not_running", err.Error())
		case errors.Is(err, assigner.ErrTestNotFound):
			writeError(w, http.StatusNotFound, "not_found", err.Error())
		default:
			writeError(w, http.StatusInternalServerError, "internal_error", err.Error())
		}
		return
	}
	writeJSON(w, http.StatusOK, res)
}

type exposureRequest struct {
	WorkspaceID   string    `json:"workspace_id"`
	TestID        string    `json:"test_id"`
	ViewerIDKey   string    `json:"viewer_id_key"`
	VariantID     string    `json:"variant_id"`
	ExposureEvent string    `json:"exposure_event"`
	IsConversion  int       `json:"is_conversion,omitempty"`
	OccurredAt    time.Time `json:"occurred_at,omitempty"`
	CHEventID     string    `json:"ch_event_id,omitempty"`
}

func (s *Server) recordExposure(w http.ResponseWriter, r *http.Request) {
	var req exposureRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid json")
		return
	}
	workspaceID, err := uuid.Parse(req.WorkspaceID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "workspace_id must be a UUID")
		return
	}
	testID, err := uuid.Parse(req.TestID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "test_id must be a UUID")
		return
	}
	variantID, err := uuid.Parse(req.VariantID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "variant_id must be a UUID")
		return
	}
	if err := s.Assigner.RecordExposure(r.Context(), model.ExposureRow{
		WorkspaceID:   workspaceID,
		TestID:        testID,
		ViewerIDKey:   req.ViewerIDKey,
		VariantID:     variantID,
		ExposureEvent: req.ExposureEvent,
		IsConversion:  req.IsConversion,
		OccurredAt:    req.OccurredAt,
		CHEventID:     req.CHEventID,
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]string{"status": "recorded"})
}

func (s *Server) graphql(w http.ResponseWriter, r *http.Request) {
	var req graphql.QueryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid json")
		return
	}
	res, err := s.GraphQL.Execute(r.Context(), req)
	if err != nil && len(res.Errors) == 0 {
		writeError(w, http.StatusInternalServerError, "internal_error", err.Error())
		return
	}
	w.Header().Set("content-type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(res)
}

func requireWorkspace(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	ws := r.Header.Get("X-Workspace-Id")
	if ws == "" {
		// Fallback to query string for dev — production sets the header.
		ws = strings.TrimSpace(r.URL.Query().Get("workspace_id"))
	}
	id, err := uuid.Parse(ws)
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "missing or invalid X-Workspace-Id")
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

// It is a tiny helper around strconv that exists so we can implement
// the assignment-id stamping API later without pulling in strconv at
// the call site.
func atoiDefault(s string, d int) int {
	if s == "" {
		return d
	}
	v, err := strconv.Atoi(s)
	if err != nil {
		return d
	}
	return v
}

var _ = atoiDefault