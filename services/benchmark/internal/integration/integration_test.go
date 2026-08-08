// Package integration is the smoke harness for the benchmark service.
// It wires registry → in-memory store → a fake ClickHouse HTTP server
// and exercises the public surface: register → write snapshot → list
// → sign → verify.
package integration

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/domio/platform/services/benchmark/internal/model"
	"github.com/domio/platform/services/benchmark/internal/registry"
	"github.com/domio/platform/services/benchmark/internal/store"
)

func TestBenchmarkSmoke(t *testing.T) {
	t.Parallel()

	// Stand up a fake ClickHouse HTTP endpoint that accepts JSONEachRow
	// INSERTs and answers SELECTs with an empty JSONEachRow stream.
	var inserts []map[string]any
	ch := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rawQuery := r.URL.RawQuery
		if bytes.Contains([]byte(rawQuery), []byte("INSERT")) {
			body, _ := io.ReadAll(r.Body)
			for _, line := range bytes.Split(body, []byte("\n")) {
				if len(line) == 0 {
					continue
				}
				var row map[string]any
				if err := json.Unmarshal(line, &row); err == nil {
					inserts = append(inserts, row)
				}
			}
			w.WriteHeader(http.StatusOK)
			return
		}
		// SELECT path or empty query → empty JSONEachRow stream.
		w.Header().Set("content-type", "application/x-ndjson")
		_, _ = w.Write([]byte(""))
	}))
	defer ch.Close()

	chs := store.NewClickHouseSnapshotWriter(ch.URL, "domio_analytics", "default", "")
	mem := store.NewInMemoryStore()
	svc := registry.New(mem)

	ctx := context.Background()
	ws := uuid.New()

	// 1. Register.
	b := model.Benchmark{
		WorkspaceID: ws,
		Name:        "smoke-test",
		MetricName:  "session_dwell_ms",
		VariantAKey: "control",
		VariantBKey: "treatment",
		Method:      model.MethodWelchT,
	}
	got, err := svc.Register(ctx, b)
	require.NoError(t, err)
	require.NotEqual(t, uuid.Nil, got.BenchmarkID)

	// 2. Write snapshot through ClickHouse writer.
	snap := model.BenchmarkSnapshot{
		WorkspaceID:  ws,
		BenchmarkID:  got.BenchmarkID,
		MetricName:   "session_dwell_ms",
		BucketDate:   time.Date(2026, 8, 1, 0, 0, 0, 0, time.UTC),
		Value:        1500.0,
		SampleSize:   128,
		RegionPinned: "us",
		UpdatedAt:    time.Now().UTC(),
	}
	require.NoError(t, chs.WriteSnapshot(ctx, snap))

	// 3. List benchmarks (must include the new one).
	list, err := svc.List(ctx, model.BenchmarkFilter{WorkspaceID: ws})
	require.NoError(t, err)
	found := false
	for _, x := range list {
		if x.BenchmarkID == got.BenchmarkID {
			found = true
			break
		}
	}
	assert.True(t, found, "list must contain the registered benchmark")

	// 4. Sign + verify.
	sig, err := svc.SignPayload(got)
	require.NoError(t, err)
	require.NotEmpty(t, sig)
	ok, err := svc.VerifySignature(got, sig)
	require.NoError(t, err)
	assert.True(t, ok, "freshly-signed payload must verify")

	// 5. The ClickHouse writer recorded at least one row.
	assert.NotEmpty(t, inserts, "ClickHouse writer must have issued an INSERT")
}

func strPtr(s string) *string { return &s }

// _ to keep the helper available for future test expansion.
var _ = strPtr

// Sanity: confirm we can fetch one benchmark via the public Get path.
func TestGetReturnsBenchmark(t *testing.T) {
	t.Parallel()
	svc := registry.New(nil) // seeded
	ws := uuid.MustParse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
	list, err := svc.List(context.Background(), model.BenchmarkFilter{WorkspaceID: ws})
	require.NoError(t, err)
	require.NotEmpty(t, list)

	got, err := svc.Get(context.Background(), ws, list[0].BenchmarkID)
	require.NoError(t, err)
	assert.Equal(t, list[0].Name, got.Name)

	// Verify chain guard: tampering the name invalidates the signature.
	sig, err := svc.SignPayload(got)
	require.NoError(t, err)
	bad := got
	bad.Name = got.Name + "-tampered"
	ok, err := svc.VerifySignature(bad, sig)
	require.NoError(t, err)
	assert.False(t, ok)
}

// Sanity: round-trip through httptest ensures that the httpapi server
// (when wired in commit 2) doesn't break the seed fixtures.
func TestSeededFixtureSnapshot(t *testing.T) {
	t.Parallel()
	mem := store.NewSeededInMemoryStore()
	ctx := context.Background()
	bid := uuid.MustParse("11111111-1111-1111-1111-111111111111")
	ws := uuid.MustParse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
	b, err := mem.Get(ctx, ws, bid)
	require.NoError(t, err)
	assert.Equal(t, "dwell_ms_control_vs_treatment", b.Name)

	// Snapshots round-trip through the in-memory writer.
	day := time.Now().UTC().Truncate(24 * time.Hour)
	require.NoError(t, mem.WriteSnapshot(ctx, model.BenchmarkSnapshot{
		WorkspaceID: ws,
		BenchmarkID: bid,
		MetricName:  b.MetricName,
		BucketDate:  day,
		Value:       2500.0,
		SampleSize:  256,
	}))
	snaps, err := mem.ReadSnapshots(ctx, bid, b.MetricName)
	require.NoError(t, err)
	require.Len(t, snaps, 1)
	assert.Equal(t, uint32(256), snaps[0].SampleSize)
}