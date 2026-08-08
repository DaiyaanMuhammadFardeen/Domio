package store

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/domio/platform/services/benchmark/internal/model"
)

// fakeDBExec is a tiny in-memory DBExec that records every
// ExecContext call. Used by the Postgres mirror tests so we can
// verify the SQL shape + parameters without a real database.
type fakeDBExec struct {
	mu       sync.Mutex
	calls    []fakeCall
	failNext error
}

type fakeCall struct {
	Query string
	Args  []interface{}
}

func (f *fakeDBExec) ExecContext(ctx context.Context, query string, args ...interface{}) (sql.Result, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.failNext != nil {
		err := f.failNext
		f.failNext = nil
		return nil, err
	}
	cp := make([]interface{}, len(args))
	copy(cp, args)
	f.calls = append(f.calls, fakeCall{Query: query, Args: cp})
	return fakeResult{}, nil
}

type fakeResult struct{}

func (fakeResult) LastInsertId() (int64, error) { return 0, nil }
func (fakeResult) RowsAffected() (int64, error) { return 1, nil }

func TestPostgresMirrorWriteSnapshot(t *testing.T) {
	t.Parallel()
	inner := NewInMemoryStore()
	db := &fakeDBExec{}
	mirror := NewPostgresMirrorWithExec(inner, db)

	ctx := context.Background()
	ws := uuid.New()
	bid := uuid.New()
	day := time.Date(2026, 8, 1, 0, 0, 0, 0, time.UTC)
	snap := model.BenchmarkSnapshot{
		WorkspaceID:  ws,
		BenchmarkID:  bid,
		MetricName:   "session_dwell_ms",
		BucketDate:   day,
		Value:        1234.5,
		SampleSize:   100,
		RegionPinned: "us",
	}
	require.NoError(t, mirror.WriteSnapshot(ctx, snap))

	// Inner store received the snapshot.
	inner_snapshots, err := inner.ReadSnapshots(ctx, bid, "session_dwell_ms")
	require.NoError(t, err)
	require.Len(t, inner_snapshots, 1)
	assert.Equal(t, 1234.5, inner_snapshots[0].Value)

	// Postgres mirror received an INSERT.
	require.Len(t, db.calls, 1)
	q := db.calls[0].Query
	assert.Contains(t, q, "INSERT INTO benchmark_snapshot")
	assert.Contains(t, q, "ON CONFLICT")
	// 7 args: workspace_id, benchmark_id, metric_name, bucket_date,
	// value, sample_size, region_pinned.
	assert.Len(t, db.calls[0].Args, 7)
	assert.Equal(t, ws, db.calls[0].Args[0])
	assert.Equal(t, bid, db.calls[0].Args[1])
	assert.Equal(t, "session_dwell_ms", db.calls[0].Args[2])
	assert.Equal(t, day, db.calls[0].Args[3])
	assert.Equal(t, 1234.5, db.calls[0].Args[4])
	assert.Equal(t, uint32(100), db.calls[0].Args[5])
	region, ok := db.calls[0].Args[6].(sql.NullString)
	require.True(t, ok)
	assert.Equal(t, "us", region.String)
	assert.True(t, region.Valid)
}

func TestPostgresMirrorInnerErrorSurfaces(t *testing.T) {
	t.Parallel()
	inner := NewInMemoryStore()
	db := &fakeDBExec{}
	mirror := NewPostgresMirrorWithExec(inner, db)

	// Force the inner store to fail by writing a snapshot with an
	// empty metric name.
	err := mirror.WriteSnapshot(context.Background(), model.BenchmarkSnapshot{
		WorkspaceID: uuid.New(),
		BenchmarkID: uuid.New(),
		MetricName:  "",
		BucketDate:  time.Now().UTC(),
	})
	require.Error(t, err)
	// Postgres must not have been touched.
	assert.Empty(t, db.calls)
}

func TestPostgresMirrorErrorPropagates(t *testing.T) {
	t.Parallel()
	inner := NewInMemoryStore()
	db := &fakeDBExec{failNext: errors.New("connection refused")}
	mirror := NewPostgresMirrorWithExec(inner, db)

	ctx := context.Background()
	ws := uuid.New()
	bid := uuid.New()
	day := time.Now().UTC().Truncate(24 * time.Hour)
	err := mirror.WriteSnapshot(ctx, model.BenchmarkSnapshot{
		WorkspaceID: ws,
		BenchmarkID: bid,
		MetricName:  "session_dwell_ms",
		BucketDate:  day,
		Value:       1.0,
		SampleSize:  1,
	})
	require.Error(t, err)
	assert.True(t, strings.Contains(err.Error(), "postgres snapshot"))
	assert.True(t, strings.Contains(err.Error(), "connection refused"))
}

func TestPostgresMirrorNoDBMeansNoOp(t *testing.T) {
	t.Parallel()
	inner := NewInMemoryStore()
	mirror := NewPostgresMirrorWithExec(inner, nil)
	ws := uuid.New()
	bid := uuid.New()
	day := time.Now().UTC().Truncate(24 * time.Hour)
	require.NoError(t, mirror.WriteSnapshot(context.Background(), model.BenchmarkSnapshot{
		WorkspaceID: ws,
		BenchmarkID: bid,
		MetricName:  "session_dwell_ms",
		BucketDate:  day,
		Value:       1.0,
		SampleSize:  1,
	}))
	// Inner still has the snapshot.
	out, err := inner.ReadSnapshots(context.Background(), bid, "session_dwell_ms")
	require.NoError(t, err)
	require.Len(t, out, 1)
}

func TestPostgresMirrorRegisterDelegates(t *testing.T) {
	t.Parallel()
	inner := NewInMemoryStore()
	mirror := NewPostgresMirrorWithExec(inner, &fakeDBExec{})
	ws := uuid.New()
	b, err := mirror.Register(context.Background(), model.Benchmark{
		WorkspaceID: ws,
		Name:        "delegated",
		MetricName:  "session_dwell_ms",
		VariantAKey: "a",
		VariantBKey: "b",
		Method:      model.MethodWelchT,
	})
	require.NoError(t, err)
	require.NotEqual(t, uuid.Nil, b.BenchmarkID)
	got, err := mirror.Get(context.Background(), ws, b.BenchmarkID)
	require.NoError(t, err)
	assert.Equal(t, b.Name, got.Name)
}