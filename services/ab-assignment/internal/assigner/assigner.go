// Package assigner is the deterministic-assignment service.
//
// Hot path:
//
//   1. Read the test (cached on the service struct).
//   2. Read variants ordered by variant_key.
//   3. Compute bucket via hash.ComputeBucket.
//   4. Map bucket → variant_key via hash.Assign.
//   5. Upsert ab_assignment row (cache for the next request).
//   6. Return AssignmentResult.
//
// The Postgres roundtrip is the slowest step (~1ms in dev), but a
// follow-up hit from the same viewer resolves from the cache.
//
// Cross-workspace contamination is prevented by always reading the
// test row under its workspace_id and computing the hash over the
// workspace_id explicitly (so two viewers with the same viewer_id_key
// in different workspaces hash differently).
package assigner

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/domio/platform/services/ab-assignment/internal/hash"
	"github.com/domio/platform/services/ab-assignment/internal/model"
	"github.com/domio/platform/services/ab-assignment/internal/store"
)

// ErrTestNotRunning — assignment refused because the test is in a
// non-running state. The HTTP layer maps this to a 409.
var ErrTestNotRunning = errors.New("assigner: test is not running")

// ErrTestNotFound — test id is unknown to this workspace.
var ErrTestNotFound = errors.New("assigner: test not found")

// ExposureSink is the optional ClickHouse sink. nil = skip.
type ExposureSink interface {
	Write(ctx context.Context, e model.ExposureRow) error
}

// Assigner is the deterministic-assignment service.
type Assigner struct {
	store store.Store
	sink  ExposureSink
	mu    sync.Mutex
	cache map[uuid.UUID]cachedTest
	now   func() time.Time
}

type cachedTest struct {
	test       model.Test
	variants   []model.Variant
	variantIDs []uuid.UUID
	variantKeys []string
	weights    []int
	cachedAt   time.Time
}

// New builds an Assigner. sink may be nil.
func New(s store.Store, sink ExposureSink) *Assigner {
	return &Assigner{
		store: s,
		sink:  sink,
		cache: map[uuid.UUID]cachedTest{},
		now:   time.Now,
	}
}

// SetClock swaps the clock — used by tests.
func (a *Assigner) SetClock(fn func() time.Time) { a.now = fn }

// cacheTTL is how long we trust the in-memory cache before re-reading
// the test row. 30 seconds is a balance between staleness (a status
// change should be visible quickly) and the read amplification on a
// hot test.
const cacheTTL = 30 * time.Second

func (a *Assigner) loadTest(ctx context.Context, workspaceID, testID uuid.UUID) (cachedTest, error) {
	a.mu.Lock()
	entry, ok := a.cache[testID]
	a.mu.Unlock()
	if ok && a.now().Sub(entry.cachedAt) < cacheTTL {
		if entry.test.WorkspaceID != workspaceID {
			return cachedTest{}, ErrTestNotFound
		}
		return entry, nil
	}
	t, err := a.store.GetTest(ctx, workspaceID, testID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			return cachedTest{}, ErrTestNotFound
		}
		return cachedTest{}, fmt.Errorf("load test: %w", err)
	}
	vs, err := a.store.ListVariants(ctx, testID)
	if err != nil {
		return cachedTest{}, fmt.Errorf("list variants: %w", err)
	}
	if len(vs) == 0 {
		return cachedTest{}, fmt.Errorf("assigner: test has no variants")
	}
	entry = cachedTest{
		test:        t,
		variants:    vs,
		variantIDs:  make([]uuid.UUID, len(vs)),
		variantKeys: make([]string, len(vs)),
		weights:     make([]int, len(vs)),
		cachedAt:    a.now(),
	}
	for i, v := range vs {
		entry.variantIDs[i] = v.VariantID
		entry.variantKeys[i] = v.VariantKey
		entry.weights[i] = v.Weight
	}
	a.mu.Lock()
	a.cache[testID] = entry
	a.mu.Unlock()
	return entry, nil
}

// Assign returns the variant for (testID, viewerIDKey) within workspaceID.
//
// The viewer_id_key is the salted viewer identifier from
// services/viewer-identity — never a raw PII value.
func (a *Assigner) Assign(ctx context.Context, workspaceID, testID uuid.UUID, viewerIDKey string) (model.AssignmentResult, error) {
	// Cache hit short-circuit.
	if row, err := a.store.GetAssignment(ctx, testID, viewerIDKey); err == nil {
		if row.WorkspaceID != workspaceID {
			return model.AssignmentResult{}, ErrTestNotFound
		}
		for _, v := range a.cachedVariants(testID) {
			if v.VariantID == row.VariantID {
				return model.AssignmentResult{
					TestID:     testID,
					VariantID:  row.VariantID,
					VariantKey: v.VariantKey,
					Bucket:     row.Bucket,
					Payload:    v.Payload,
					AssignedAt: row.AssignedAt,
					FromCache:  true,
				}, nil
			}
		}
	}

	entry, err := a.loadTest(ctx, workspaceID, testID)
	if err != nil {
		return model.AssignmentResult{}, err
	}
	if entry.test.Status != model.StatusRunning {
		return model.AssignmentResult{}, ErrTestNotRunning
	}

	assignment, err := hash.Assign(
		workspaceID.String(),
		testID.String(),
		entry.test.HashSalt,
		viewerIDKey,
		entry.variantKeys,
		entry.weights,
		100,
	)
	if err != nil {
		return model.AssignmentResult{}, err
	}
	// Map the variant_key back to the variant row.
	var picked model.Variant
	for _, v := range entry.variants {
		if v.VariantKey == assignment.VariantKey {
			picked = v
			break
		}
	}
	now := a.now()
	row, err := a.store.UpsertAssignment(ctx, model.AssignmentRow{
		WorkspaceID: workspaceID,
		TestID:      testID,
		ViewerIDKey: viewerIDKey,
		VariantID:   picked.VariantID,
		Bucket:      assignment.Bucket,
		AssignedAt:  now,
	})
	if err != nil {
		return model.AssignmentResult{}, fmt.Errorf("upsert assignment: %w", err)
	}
	return model.AssignmentResult{
		TestID:     testID,
		VariantID:  row.VariantID,
		VariantKey: picked.VariantKey,
		Bucket:     row.Bucket,
		Payload:    picked.Payload,
		AssignedAt: row.AssignedAt,
		FromCache:  false,
	}, nil
}

// RecordExposure writes an exposure row to Postgres + ClickHouse.
// The conversion flag is set when the exposure matches the test's
// conversion_event.
func (a *Assigner) RecordExposure(ctx context.Context, e model.ExposureRow) error {
	if e.ExposureID == uuid.Nil {
		e.ExposureID = uuid.New()
	}
	if e.OccurredAt.IsZero() {
		e.OccurredAt = a.now()
	}
	stored, err := a.store.RecordExposure(ctx, e)
	if err != nil {
		return fmt.Errorf("record exposure: %w", err)
	}
	if a.sink != nil {
		// ClickHouse failures are non-fatal.
		_ = a.sink.Write(ctx, stored)
	}
	return nil
}

// InvalidateCache drops the in-memory cache for one test — used by the
// CRUD endpoints after a variant change.
func (a *Assigner) InvalidateCache(testID uuid.UUID) {
	a.mu.Lock()
	delete(a.cache, testID)
	a.mu.Unlock()
}

func (a *Assigner) cachedVariants(testID uuid.UUID) []model.Variant {
	a.mu.Lock()
	defer a.mu.Unlock()
	entry, ok := a.cache[testID]
	if !ok {
		return nil
	}
	return entry.variants
}