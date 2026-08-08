package store

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/domio/platform/services/benchmark/internal/model"
)

func seedBench(ws uuid.UUID, name string) model.Benchmark {
	return model.Benchmark{
		WorkspaceID: ws,
		Name:        name,
		MetricName:  "session_dwell_ms",
		VariantAKey: "control",
		VariantBKey: "treatment",
		Method:      model.MethodWelchT,
	}
}

func TestInMemoryRoundTrip(t *testing.T) {
	t.Parallel()
	s := NewInMemoryStore()
	ctx := context.Background()
	ws := uuid.New()

	b := seedBench(ws, "round-trip")
	b, err := s.Register(ctx, b)
	require.NoError(t, err)
	require.NotEqual(t, uuid.Nil, b.BenchmarkID)

	got, err := s.Get(ctx, ws, b.BenchmarkID)
	require.NoError(t, err)
	assert.Equal(t, b.Name, got.Name)
	assert.Equal(t, b.MetricName, got.MetricName)

	// Write + read snapshot.
	day := time.Date(2026, 8, 1, 0, 0, 0, 0, time.UTC)
	require.NoError(t, s.WriteSnapshot(ctx, model.BenchmarkSnapshot{
		WorkspaceID: ws,
		BenchmarkID: b.BenchmarkID,
		MetricName:  "session_dwell_ms",
		BucketDate:  day,
		Value:       1234.5,
		SampleSize:  42,
	}))
	snaps, err := s.ReadSnapshots(ctx, b.BenchmarkID, "session_dwell_ms")
	require.NoError(t, err)
	require.Len(t, snaps, 1)
	assert.Equal(t, 1234.5, snaps[0].Value)
}

func TestInMemoryConflictOnID(t *testing.T) {
	t.Parallel()
	s := NewInMemoryStore()
	ctx := context.Background()
	ws := uuid.New()

	b1 := seedBench(ws, "first")
	b1, err := s.Register(ctx, b1)
	require.NoError(t, err)

	// Re-register with the same BenchmarkID must conflict.
	b2 := seedBench(ws, "second")
	b2.BenchmarkID = b1.BenchmarkID
	_, err = s.Register(ctx, b2)
	require.Error(t, err)
	assert.True(t, errors.Is(err, ErrConflict))

	// Same (workspace_id, name) also conflicts.
	b3 := seedBench(ws, "first")
	_, err = s.Register(ctx, b3)
	require.Error(t, err)
	assert.True(t, errors.Is(err, ErrConflict))
}

func TestInMemoryListByWorkspaceIsolation(t *testing.T) {
	t.Parallel()
	s := NewInMemoryStore()
	ctx := context.Background()
	wsA := uuid.New()
	wsB := uuid.New()

	_, err := s.Register(ctx, seedBench(wsA, "ws-a-only"))
	require.NoError(t, err)
	_, err = s.Register(ctx, seedBench(wsA, "ws-a-two"))
	require.NoError(t, err)
	_, err = s.Register(ctx, seedBench(wsB, "ws-b-only"))
	require.NoError(t, err)

	aList, err := s.List(ctx, model.BenchmarkFilter{WorkspaceID: wsA})
	require.NoError(t, err)
	assert.Len(t, aList, 2)
	for _, b := range aList {
		assert.Equal(t, wsA, b.WorkspaceID)
	}

	bList, err := s.List(ctx, model.BenchmarkFilter{WorkspaceID: wsB})
	require.NoError(t, err)
	assert.Len(t, bList, 1)
	assert.Equal(t, "ws-b-only", bList[0].Name)
}

func TestInMemorySortByUpdated(t *testing.T) {
	t.Parallel()
	s := NewInMemoryStore()
	ctx := context.Background()
	ws := uuid.New()

	b1 := seedBench(ws, "alpha")
	b1, err := s.Register(ctx, b1)
	require.NoError(t, err)

	// Force b1 to be older than the next insert by sleeping briefly.
	time.Sleep(2 * time.Millisecond)

	b2 := seedBench(ws, "beta")
	b2, err = s.Register(ctx, b2)
	require.NoError(t, err)

	b3 := seedBench(ws, "gamma")
	b3, err = s.Register(ctx, b3)
	require.NoError(t, err)

	// Touch b1 to make it newest.
	_, err = s.Archive(ctx, ws, b1.BenchmarkID)
	require.NoError(t, err)

	list, err := s.List(ctx, model.BenchmarkFilter{WorkspaceID: ws})
	require.NoError(t, err)
	require.Len(t, list, 3)
	// b1 was just archived (most-recent UpdatedAt); b3 second; b2 last.
	assert.Equal(t, "alpha", list[0].Name)
	assert.Equal(t, "gamma", list[1].Name)
	assert.Equal(t, "beta", list[2].Name)
}

func TestInMemoryPaginate(t *testing.T) {
	t.Parallel()
	s := NewInMemoryStore()
	ctx := context.Background()
	ws := uuid.New()

	for i := 0; i < 7; i++ {
		_, err := s.Register(ctx, seedBench(ws, "p-"+uuid.New().String()[:6]))
		require.NoError(t, err)
	}

	page1, err := s.List(ctx, model.BenchmarkFilter{WorkspaceID: ws, Limit: 3, Offset: 0})
	require.NoError(t, err)
	assert.Len(t, page1, 3)

	page2, err := s.List(ctx, model.BenchmarkFilter{WorkspaceID: ws, Limit: 3, Offset: 3})
	require.NoError(t, err)
	assert.Len(t, page2, 3)

	page3, err := s.List(ctx, model.BenchmarkFilter{WorkspaceID: ws, Limit: 3, Offset: 6})
	require.NoError(t, err)
	assert.Len(t, page3, 1)

	// Out-of-range offset returns empty, not error.
	empty, err := s.List(ctx, model.BenchmarkFilter{WorkspaceID: ws, Limit: 3, Offset: 100})
	require.NoError(t, err)
	assert.Empty(t, empty)

	// Distinct rows between page1 and page2.
	seen := map[uuid.UUID]bool{}
	for _, b := range page1 {
		seen[b.BenchmarkID] = true
	}
	for _, b := range page2 {
		assert.False(t, seen[b.BenchmarkID], "pagination must not repeat rows")
	}
}