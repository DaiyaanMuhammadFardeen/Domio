package materialize

import (
	"context"
	"os"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
)

// ---------------------------------------------------------------------------
// MemStore tests
// ---------------------------------------------------------------------------

func TestMemStore_InsertOps(t *testing.T) {
	store := NewMemStore()
	ctx := context.Background()

	ops := []OpRecord{
		{OpID: "op-1", DeckID: "deck-a", BranchID: "main", HLCPhysical: 100, HLCLogical: 0},
		{OpID: "op-2", DeckID: "deck-a", BranchID: "main", HLCPhysical: 200, HLCLogical: 0},
		{OpID: "op-3", DeckID: "deck-b", BranchID: "main", HLCPhysical: 150, HLCLogical: 0},
	}

	err := store.InsertOps(ctx, ops)
	require.NoError(t, err)

	assert.Equal(t, 3, store.OpCount())

	// Check heads advanced correctly.
	assert.Equal(t, [2]int64{200, 0}, store.Heads["deck-a"]["main"])
	assert.Equal(t, [2]int64{150, 0}, store.Heads["deck-b"]["main"])
}

func TestMemStore_InsertOpsEmpty(t *testing.T) {
	store := NewMemStore()
	err := store.InsertOps(context.Background(), nil)
	require.NoError(t, err)
	assert.Equal(t, 0, store.OpCount())
}

func TestMemStore_Idempotent(t *testing.T) {
	store := NewMemStore()
	ctx := context.Background()

	ops := []OpRecord{
		{OpID: "op-1", DeckID: "deck-a", BranchID: "main", HLCPhysical: 100, HLCLogical: 0},
	}

	require.NoError(t, store.InsertOps(ctx, ops))
	require.NoError(t, store.InsertOps(ctx, ops)) // duplicate — MemStore doesn't dedup, that's pgx's job

	// MemStore is a simple append store; idempotency is enforced by ON CONFLICT DO NOTHING in pgxStore.
}

func TestMemStore_BranchHeadAdvance(t *testing.T) {
	store := NewMemStore()
	ctx := context.Background()

	ops := []OpRecord{
		{OpID: "op-1", DeckID: "deck-a", BranchID: "main", HLCPhysical: 100, HLCLogical: 0},
		{OpID: "op-2", DeckID: "deck-a", BranchID: "main", HLCPhysical: 50, HLCLogical: 10},  // lower physical, higher logical
		{OpID: "op-3", DeckID: "deck-a", BranchID: "main", HLCPhysical: 200, HLCLogical: 0},  // higher physical
	}

	require.NoError(t, store.InsertOps(ctx, ops))

	// Head should be max physical, so 200/0.
	assert.Equal(t, [2]int64{200, 0}, store.Heads["deck-a"]["main"])
}

// ---------------------------------------------------------------------------
// Materializer tests (unit — no DB required)
// ---------------------------------------------------------------------------

func TestMaterializer_PushAndFlush(t *testing.T) {
	store := NewMemStore()
	logger := zap.NewNop()

	var flushCount atomic.Int32
	var flushedOps []OpRecord
	var mu sync.Mutex

	mat := New(store, logger,
		WithBatchSize(3),
		WithFlushInterval(1*time.Second),
		WithFlushCallback(func(ops []OpRecord) {
			flushCount.Add(1)
			mu.Lock()
			flushedOps = append(flushedOps, ops...)
			mu.Unlock()
		}),
	)

	// Push 3 ops — should trigger flush at batch size.
	for i := 0; i < 3; i++ {
		mat.Push(OpRecord{
			OpID:     "op-" + string(rune('A'+i)),
			DeckID:   "deck-1",
			BranchID: "main",
		})
	}

	// Wait briefly for async flush.
	time.Sleep(200 * time.Millisecond)

	assert.Equal(t, 3, store.OpCount())
	assert.Equal(t, int32(1), flushCount.Load())

	mu.Lock()
	assert.Len(t, flushedOps, 3)
	mu.Unlock()

	mat.Stop()
}

func TestMaterializer_FlushOnTimer(t *testing.T) {
	store := NewMemStore()
	logger := zap.NewNop()

	var flushCount atomic.Int32

	mat := New(store, logger,
		WithBatchSize(100), // high batch size so timer fires first
		WithFlushInterval(50*time.Millisecond),
		WithFlushCallback(func(ops []OpRecord) {
			flushCount.Add(1)
		}),
	)

	// Push a single op — won't hit batch size but timer will fire.
	mat.Push(OpRecord{
		OpID:   "op-timer",
		DeckID: "deck-1",
	})

	// Wait for the flush timer.
	time.Sleep(200 * time.Millisecond)

	assert.Equal(t, 1, store.OpCount())
	assert.GreaterOrEqual(t, flushCount.Load(), int32(1))

	mat.Stop()
}

func TestMaterializer_StopDrainsBuffer(t *testing.T) {
	store := NewMemStore()
	logger := zap.NewNop()

	mat := New(store, logger,
		WithBatchSize(100), // high batch — won't auto-flush
		WithFlushInterval(10*time.Second),
	)

	mat.Push(OpRecord{OpID: "op-drain-1", DeckID: "deck-1"})
	mat.Push(OpRecord{OpID: "op-drain-2", DeckID: "deck-1"})

	mat.Stop() // should drain the buffer

	assert.Equal(t, 2, store.OpCount())
}

func TestMaterializer_BufferLen(t *testing.T) {
	store := NewMemStore()
	logger := zap.NewNop()

	mat := New(store, logger,
		WithBatchSize(100),
		WithFlushInterval(10*time.Second),
	)

	assert.Equal(t, 0, mat.BufferLen())

	mat.Push(OpRecord{OpID: "op-1", DeckID: "deck-1"})
	mat.Push(OpRecord{OpID: "op-2", DeckID: "deck-1"})
	assert.Equal(t, 2, mat.BufferLen())

	mat.Stop()
}

// ---------------------------------------------------------------------------
// PGXStore integration tests
// ---------------------------------------------------------------------------

func skipIfNoPostgres(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("POSTGRES_URL")
	if dsn == "" {
		dsn = "postgres://domio:domio@localhost:5432/domio?sslmode=disable"
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	poolCfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Skipf("postgres parse config: %v", err)
	}
	poolCfg.ConnConfig.RuntimeParams["app.bypass_rls"] = "on"

	pool, err := pgxpool.NewWithConfig(ctx, poolCfg)
	if err != nil {
		t.Skipf("postgres unreachable: %v", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		t.Skipf("postgres ping failed: %v", err)
	}
	return pool
}

func seedDeck(t *testing.T, pool *pgxpool.Pool, deckID string) {
	t.Helper()
	ctx := context.Background()
	_, _ = pool.Exec(ctx, `INSERT INTO tenants (tenant_id, display_name) VALUES ('test-tenant', 'Test') ON CONFLICT DO NOTHING`)
	_, _ = pool.Exec(ctx, `INSERT INTO workspaces (workspace_id, tenant_id, name) VALUES ('test-ws', 'test-tenant', 'Test WS') ON CONFLICT DO NOTHING`)
	_, err := pool.Exec(ctx,
		`INSERT INTO decks (id, workspace_id, tenant_id, title, schema_version, owner_id)
		 VALUES ($1, 'test-ws', 'test-tenant', 'Test Deck', '1.0', 'user-1')
		 ON CONFLICT (id) DO NOTHING`,
		deckID,
	)
	require.NoError(t, err)
}

func TestPGXStore_InsertOps(t *testing.T) {
	pool := skipIfNoPostgres(t)
	defer pool.Close()

	ctx := context.Background()
	deckID := "mat-test-" + time.Now().Format("0102150405.000")
	seedDeck(t, pool, deckID)

	t.Cleanup(func() {
		pool.Exec(ctx, `DELETE FROM crdt_logs WHERE deck_id = $1`, deckID)
		pool.Exec(ctx, `DELETE FROM decks WHERE id = $1`, deckID)
	})

	store := NewPGXStore(pool)
	ops := []OpRecord{
		{
			OpID:        "pgx-op-1",
			DeckID:      deckID,
			BranchID:    "main",
			SlideID:     "slide-1",
			AuthorID:    "user-1",
			HLCPhysical: 1000,
			HLCLogical:  0,
			OpType:      "yjs_update",
			Payload:     []byte{0x01, 0x02, 0x03},
			Metadata:    map[string]any{"source": "test"},
		},
		{
			OpID:        "pgx-op-2",
			DeckID:      deckID,
			BranchID:    "main",
			AuthorID:    "user-1",
			HLCPhysical: 2000,
			HLCLogical:  0,
			OpType:      "yjs_update",
			Payload:     []byte{0x04, 0x05},
		},
	}

	err := store.InsertOps(ctx, ops)
	require.NoError(t, err)

	// Verify ops written.
	var count int
	err = pool.QueryRow(ctx, `SELECT COUNT(*) FROM crdt_logs WHERE deck_id = $1`, deckID).Scan(&count)
	require.NoError(t, err)
	assert.Equal(t, 2, count)

	// Verify branch_head was upserted.
	var phys, logi int64
	err = pool.QueryRow(ctx, `SELECT hlc_physical, hlc_logical FROM branch_heads WHERE deck_id = $1 AND branch_id = 'main'`, deckID).Scan(&phys, &logi)
	require.NoError(t, err)
	assert.Equal(t, int64(2000), phys)
}

func TestPGXStore_InsertOpsIdempotent(t *testing.T) {
	pool := skipIfNoPostgres(t)
	defer pool.Close()

	ctx := context.Background()
	deckID := "mat-idemp-" + time.Now().Format("0102150405.000")
	seedDeck(t, pool, deckID)

	t.Cleanup(func() {
		pool.Exec(ctx, `DELETE FROM crdt_logs WHERE deck_id = $1`, deckID)
		pool.Exec(ctx, `DELETE FROM decks WHERE id = $1`, deckID)
	})

	store := NewPGXStore(pool)
	ops := []OpRecord{
		{OpID: "idemp-op-1", DeckID: deckID, BranchID: "main", AuthorID: "user-1", HLCPhysical: 100, OpType: "yjs_update", Payload: []byte{0x01}},
	}

	require.NoError(t, store.InsertOps(ctx, ops))
	require.NoError(t, store.InsertOps(ctx, ops)) // duplicate insert — should be no-op

	var count int
	err := pool.QueryRow(ctx, `SELECT COUNT(*) FROM crdt_logs WHERE op_id = 'idemp-op-1'`).Scan(&count)
	require.NoError(t, err)
	assert.Equal(t, 1, count)
}
