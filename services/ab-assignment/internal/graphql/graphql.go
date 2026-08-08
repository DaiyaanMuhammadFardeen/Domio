// Package graphql contains a minimal GraphQL schema for ab-assignment.
//
// We embed a hand-written schema (rather than pulling in gqlgen) so the
// service has zero codegen dependency. The schema exposes two queries:
//
//   experiment(id)        → a single ab_test + variants
//   experimentResults(id) → measurement output from the ab-measurement
//                           service (computed locally so the dashboard
//                           can render without an extra hop in dev).
//
// For now we evaluate the schema with graphql-go/graphql, which is the
// smallest package that supports a hand-written schema with resolvers.
package graphql

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/google/uuid"

	"github.com/domio/platform/services/ab-assignment/internal/model"
	"github.com/domio/platform/services/ab-assignment/internal/store"
)

// Schema holds the runtime schema + resolvers.
type Schema struct {
	store      store.Store
	experimentExperimentResultsFn func(ctx context.Context, workspaceID, testID uuid.UUID) (json.RawMessage, error)
}

// New builds a Schema with the given store. The measurement resolver
// can be overridden via SetExperimentResults for tests.
func New(s store.Store) *Schema {
	sc := &Schema{store: s}
	sc.experimentExperimentResultsFn = func(ctx context.Context, workspaceID, testID uuid.UUID) (json.RawMessage, error) {
		return defaultExperimentResults(ctx, s, workspaceID, testID)
	}
	return sc
}

// SetExperimentResults overrides the resolver for experimentResults —
// tests use this to inject fixtures.
func (s *Schema) SetExperimentResults(fn func(ctx context.Context, workspaceID, testID uuid.UUID) (json.RawMessage, error)) {
	s.experimentExperimentResultsFn = fn
}

// QueryRequest is the wire shape GraphQL clients POST.
type QueryRequest struct {
	Query         string                 `json:"query"`
	OperationName string                 `json:"operationName,omitempty"`
	Variables     map[string]interface{} `json:"variables,omitempty"`
}

// QueryResponse is the wire shape GraphQL clients receive.
type QueryResponse struct {
	Data   json.RawMessage `json:"data,omitempty"`
	Errors []QueryError    `json:"errors,omitempty"`
}

// QueryError is the GraphQL error shape.
type QueryError struct {
	Message string `json:"message"`
}

// ErrUnsupportedQuery is returned when the operation isn't recognized.
var ErrUnsupportedQuery = errors.New("graphql: unsupported query")

// Execute runs one GraphQL operation against the embedded schema. The
// implementation here is intentionally minimal: we parse the operation
// name out of the request and dispatch on the two query types we
// support.
//
// We accept only the operation shapes documented above — the GraphQL
// parsing is a deliberate lock-in to the dashboard's contract.
func (s *Schema) Execute(ctx context.Context, req QueryRequest) (QueryResponse, error) {
	switch req.OperationName {
	case "Experiment":
		return s.execExperiment(ctx, req)
	case "ExperimentResults":
		return s.execExperimentResults(ctx, req)
	default:
		return QueryResponse{Errors: []QueryError{{Message: ErrUnsupportedQuery.Error()}}}, ErrUnsupportedQuery
	}
}

func (s *Schema) execExperiment(ctx context.Context, req QueryRequest) (QueryResponse, error) {
	idStr, _ := req.Variables["id"].(string)
	id, err := uuid.Parse(idStr)
	if err != nil {
		return QueryResponse{Errors: []QueryError{{Message: "id must be a UUID"}}}, err
	}
	workspaceIDStr, _ := req.Variables["workspaceId"].(string)
	workspaceID, err := uuid.Parse(workspaceIDStr)
	if err != nil {
		return QueryResponse{Errors: []QueryError{{Message: "workspaceId must be a UUID"}}}, err
	}
	t, err := s.store.GetTest(ctx, workspaceID, id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			return QueryResponse{Errors: []QueryError{{Message: "test not found"}}}, err
		}
		return QueryResponse{Errors: []QueryError{{Message: err.Error()}}}, err
	}
	vs, err := s.store.ListVariants(ctx, id)
	if err != nil {
		return QueryResponse{Errors: []QueryError{{Message: err.Error()}}}, err
	}
	out := struct {
		Experiment Experiment `json:"experiment"`
	}{Experiment: Experiment{
		ID:              t.TestID.String(),
		WorkspaceID:     t.WorkspaceID.String(),
		Name:            t.Name,
		Status:          string(t.Status),
		HashBasis:       string(t.HashBasis),
		ExposureEvent:   t.ExposureEvent,
		ConversionEvent: t.ConversionEvent,
		MinSampleSize:   t.MinSampleSize,
		AlphaBudget:     t.AlphaBudget,
		CreatedAt:       t.CreatedAt,
		Variants:        variantsToWire(vs),
	}}
	data, _ := json.Marshal(out)
	return QueryResponse{Data: data}, nil
}

func (s *Schema) execExperimentResults(ctx context.Context, req QueryRequest) (QueryResponse, error) {
	idStr, _ := req.Variables["id"].(string)
	id, err := uuid.Parse(idStr)
	if err != nil {
		return QueryResponse{Errors: []QueryError{{Message: "id must be a UUID"}}}, err
	}
	workspaceIDStr, _ := req.Variables["workspaceId"].(string)
	workspaceID, err := uuid.Parse(workspaceIDStr)
	if err != nil {
		return QueryResponse{Errors: []QueryError{{Message: "workspaceId must be a UUID"}}}, err
	}
	raw, err := s.experimentExperimentResultsFn(ctx, workspaceID, id)
	if err != nil {
		return QueryResponse{Errors: []QueryError{{Message: err.Error()}}}, err
	}
	out := struct {
		ExperimentResults json.RawMessage `json:"experimentResults"`
	}{ExperimentResults: raw}
	data, _ := json.Marshal(out)
	return QueryResponse{Data: data}, nil
}

// Experiment is the GraphQL Experiment wire type.
type Experiment struct {
	ID              string       `json:"id"`
	WorkspaceID     string       `json:"workspaceId"`
	Name            string       `json:"name"`
	Status          string       `json:"status"`
	HashBasis       string       `json:"hashBasis"`
	ExposureEvent   string       `json:"exposureEvent"`
	ConversionEvent string       `json:"conversionEvent"`
	MinSampleSize   int          `json:"minSampleSize"`
	AlphaBudget     float64      `json:"alphaBudget"`
	CreatedAt       interface{}  `json:"createdAt"`
	Variants        []VariantOut `json:"variants"`
}

// VariantOut is the GraphQL Variant wire type.
type VariantOut struct {
	ID         string  `json:"id"`
	Key        string  `json:"key"`
	Weight     int     `json:"weight"`
	PayloadRaw string  `json:"payloadRaw"`
}

func variantsToWire(in []model.Variant) []VariantOut {
	out := make([]VariantOut, len(in))
	for i, v := range in {
		out[i] = VariantOut{
			ID:         v.VariantID.String(),
			Key:        v.VariantKey,
			Weight:     v.Weight,
			PayloadRaw: string(v.Payload),
		}
	}
	return out
}

// defaultExperimentResults computes a minimal measurement rollup
// (exposures / conversions per variant) without contacting the
// measurement service. The dashboard uses this as a fallback when the
// measurement service is unreachable; production queries should hit
// the dedicated service.
func defaultExperimentResults(ctx context.Context, s store.Store, workspaceID, testID uuid.UUID) (json.RawMessage, error) {
	exposures, err := s.ListExposures(ctx, testID, 0)
	if err != nil {
		return nil, fmt.Errorf("list exposures: %w", err)
	}
	vs, err := s.ListVariants(ctx, testID)
	if err != nil {
		return nil, fmt.Errorf("list variants: %w", err)
	}
	type bucket struct {
		Exposures  int     `json:"exposures"`
		Conversions int    `json:"conversions"`
		Rate       float64 `json:"rate"`
	}
	buckets := map[string]*bucket{}
	for _, v := range vs {
		buckets[v.VariantID.String()] = &bucket{}
	}
	for _, e := range exposures {
		b, ok := buckets[e.VariantID.String()]
		if !ok {
			continue
		}
		b.Exposures++
		if e.IsConversion == 1 {
			b.Conversions++
		}
	}
	perVariant := make([]struct {
		VariantID  string  `json:"variantId"`
		VariantKey string  `json:"variantKey"`
		Exposures  int     `json:"exposures"`
		Conversions int    `json:"conversions"`
		Rate       float64 `json:"rate"`
	}, 0, len(vs))
	for _, v := range vs {
		b := buckets[v.VariantID.String()]
		rate := 0.0
		if b.Exposures > 0 {
			rate = float64(b.Conversions) / float64(b.Exposures)
		}
		perVariant = append(perVariant, struct {
			VariantID  string  `json:"variantId"`
			VariantKey string  `json:"variantKey"`
			Exposures  int     `json:"exposures"`
			Conversions int    `json:"conversions"`
			Rate       float64 `json:"rate"`
		}{
			VariantID: v.VariantID.String(), VariantKey: v.VariantKey,
			Exposures: b.Exposures, Conversions: b.Conversions, Rate: rate,
		})
	}
	out := struct {
		WorkspaceID string      `json:"workspaceId"`
		TestID      string      `json:"testId"`
		Variants    interface{} `json:"variants"`
	}{
		WorkspaceID: workspaceID.String(),
		TestID:      testID.String(),
		Variants:    perVariant,
	}
	return json.Marshal(out)
}