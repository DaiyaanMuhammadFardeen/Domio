package store

import (
	"context"
	"errors"
	"sort"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/domio/platform/services/ab-assignment/internal/model"
)

// InMemoryStore is a goroutine-safe Store used by tests. It is *not*
// designed to survive a service restart; the only production state that
// can be lost without consequence is the assignment cache (which is
// always recomputable from the hash).
type InMemoryStore struct {
	mu          sync.Mutex
	tests       map[uuid.UUID]model.Test
	variants    map[uuid.UUID]model.Variant // by variant_id
	variantsByTest map[uuid.UUID][]model.Variant
	assignments map[string]model.AssignmentRow // key = test_id|viewer_id_key
	exposures   map[uuid.UUID]model.ExposureRow
	exposuresByTest map[uuid.UUID][]model.ExposureRow
}

// NewInMemoryStore returns an empty InMemoryStore.
func NewInMemoryStore() *InMemoryStore {
	return &InMemoryStore{
		tests:          map[uuid.UUID]model.Test{},
		variants:       map[uuid.UUID]model.Variant{},
		variantsByTest: map[uuid.UUID][]model.Variant{},
		assignments:    map[string]model.AssignmentRow{},
		exposures:      map[uuid.UUID]model.ExposureRow{},
		exposuresByTest: map[uuid.UUID][]model.ExposureRow{},
	}
}

func assignmentKey(testID uuid.UUID, viewerIDKey string) string {
	return testID.String() + "|" + viewerIDKey
}

func (s *InMemoryStore) GetTest(_ context.Context, workspaceID, testID uuid.UUID) (model.Test, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	t, ok := s.tests[testID]
	if !ok {
		return model.Test{}, ErrNotFound
	}
	if t.WorkspaceID != workspaceID {
		// Cross-tenant access is masked as not-found. The Postgres path
		// enforces the same invariant via RLS.
		return model.Test{}, ErrNotFound
	}
	return t, nil
}

func (s *InMemoryStore) GetTestByName(_ context.Context, workspaceID uuid.UUID, name string) (model.Test, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, t := range s.tests {
		if t.WorkspaceID == workspaceID && t.Name == name {
			return t, nil
		}
	}
	return model.Test{}, ErrNotFound
}

func (s *InMemoryStore) ListTests(_ context.Context, workspaceID uuid.UUID) ([]model.Test, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]model.Test, 0, len(s.tests))
	for _, t := range s.tests {
		if t.WorkspaceID == workspaceID {
			out = append(out, t)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.Before(out[j].CreatedAt) })
	return out, nil
}

func (s *InMemoryStore) CreateTest(_ context.Context, t model.Test) (model.Test, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if t.TestID == uuid.Nil {
		t.TestID = uuid.New()
	}
	if t.CreatedAt.IsZero() {
		t.CreatedAt = time.Now().UTC()
	}
	s.tests[t.TestID] = t
	return t, nil
}

func (s *InMemoryStore) UpdateTest(_ context.Context, t model.Test) (model.Test, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.tests[t.TestID]; !ok {
		return model.Test{}, ErrNotFound
	}
	s.tests[t.TestID] = t
	return t, nil
}

func (s *InMemoryStore) ListVariants(_ context.Context, testID uuid.UUID) ([]model.Variant, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	vs := s.variantsByTest[testID]
	out := make([]model.Variant, len(vs))
	copy(out, vs)
	sort.Slice(out, func(i, j int) bool { return out[i].VariantKey < out[j].VariantKey })
	return out, nil
}

func (s *InMemoryStore) CreateVariant(_ context.Context, v model.Variant) (model.Variant, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if v.VariantID == uuid.Nil {
		v.VariantID = uuid.New()
	}
	if v.CreatedAt.IsZero() {
		v.CreatedAt = time.Now().UTC()
	}
	s.variants[v.VariantID] = v
	s.variantsByTest[v.TestID] = append(s.variantsByTest[v.TestID], v)
	return v, nil
}

func (s *InMemoryStore) ReplaceVariants(_ context.Context, testID uuid.UUID, variants []model.Variant) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, v := range variants {
		if v.TestID != testID {
			return ErrInvalidVariant
		}
	}
	s.variantsByTest[testID] = nil
	for _, v := range variants {
		s.variantsByTest[testID] = append(s.variantsByTest[testID], v)
		s.variants[v.VariantID] = v
	}
	return nil
}

// ErrInvalidVariant — variant references a different test than the
// caller asked to replace. Used by tests; the production Postgres path
// enforces this via foreign keys.
var ErrInvalidVariant = errors.New("store: variant test_id mismatch")

func (s *InMemoryStore) GetAssignment(_ context.Context, testID uuid.UUID, viewerIDKey string) (model.AssignmentRow, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	a, ok := s.assignments[assignmentKey(testID, viewerIDKey)]
	if !ok {
		return model.AssignmentRow{}, ErrNotFound
	}
	return a, nil
}

func (s *InMemoryStore) UpsertAssignment(_ context.Context, a model.AssignmentRow) (model.AssignmentRow, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if a.AssignmentID == uuid.Nil {
		a.AssignmentID = uuid.New()
	}
	if a.AssignedAt.IsZero() {
		a.AssignedAt = time.Now().UTC()
	}
	s.assignments[assignmentKey(a.TestID, a.ViewerIDKey)] = a
	return a, nil
}

func (s *InMemoryStore) RecordExposure(_ context.Context, e model.ExposureRow) (model.ExposureRow, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if e.ExposureID == uuid.Nil {
		e.ExposureID = uuid.New()
	}
	if e.OccurredAt.IsZero() {
		e.OccurredAt = time.Now().UTC()
	}
	s.exposures[e.ExposureID] = e
	s.exposuresByTest[e.TestID] = append(s.exposuresByTest[e.TestID], e)
	return e, nil
}

func (s *InMemoryStore) ListExposures(_ context.Context, testID uuid.UUID, sinceUnixMs int64) ([]model.ExposureRow, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	cutoff := time.UnixMilli(sinceUnixMs)
	out := make([]model.ExposureRow, 0)
	for _, e := range s.exposuresByTest[testID] {
		if e.OccurredAt.Before(cutoff) {
			continue
		}
		out = append(out, e)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].OccurredAt.Before(out[j].OccurredAt) })
	return out, nil
}