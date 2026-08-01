package snapshot

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/binary"
	"io"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
)

// ---------------------------------------------------------------------------
// compressPayloads / decompress round-trip
// ---------------------------------------------------------------------------

func TestCompressPayloads_RoundTrip(t *testing.T) {
	payloads := [][]byte{
		{0x01, 0x02, 0x03},
		{0x04, 0x05, 0x06, 0x07},
		{0x08},
	}

	compressed, err := compressPayloads(payloads)
	require.NoError(t, err)
	require.NotEmpty(t, compressed)

	// Decompress.
	gz, err := gzip.NewReader(bytes.NewReader(compressed))
	require.NoError(t, err)
	defer gz.Close()

	raw, err := io.ReadAll(gz)
	require.NoError(t, err)

	// Parse length-prefixed payloads.
	var roundTripped [][]byte
	off := 0
	for off < len(raw) {
		if off+4 > len(raw) {
			t.Fatalf("unexpected end of data at offset %d", off)
		}
		size := binary.BigEndian.Uint32(raw[off : off+4])
		off += 4
		roundTripped = append(roundTripped, raw[off:off+int(size)])
		off += int(size)
	}

	assert.Equal(t, payloads, roundTripped)
}

func TestCompressPayloads_Empty(t *testing.T) {
	compressed, err := compressPayloads(nil)
	require.NoError(t, err)
	// Empty gzip is still valid (just a header + footer).
	gz, err := gzip.NewReader(bytes.NewReader(compressed))
	require.NoError(t, err)
	defer gz.Close()
	raw, err := io.ReadAll(gz)
	require.NoError(t, err)
	assert.Empty(t, raw)
}

// ---------------------------------------------------------------------------
// Manager — unit tests with MemSnapshotStore
// ---------------------------------------------------------------------------

// memStore is a minimal in-memory SnapshotStore for unit tests.
type memStore struct {
	snapshots []SnapshotRow
	payloads  map[string][][]byte // key = deckID:branchID
	hlcs      map[string][2]int64 // key = deckID
}

func newMemStore() *memStore {
	return &memStore{
		payloads: make(map[string][][]byte),
		hlcs:     make(map[string][2]int64),
	}
}

func (m *memStore) InsertSnapshotRow(_ context.Context, row SnapshotRow) error {
	m.snapshots = append(m.snapshots, row)
	return nil
}

func (m *memStore) LastSnapshotHLC(_ context.Context, deckID string) (int64, int64, error) {
	h := m.hlcs[deckID]
	return h[0], h[1], nil
}

func (m *memStore) PayloadsSince(_ context.Context, deckID, branchID string, afterPhysical, afterLogical int64) ([][]byte, error) {
	key := deckID + ":" + branchID
	var result [][]byte
	for _, p := range m.payloads[key] {
		// In memStore we don't track per-payload HLC; return all (simplified).
		_ = afterPhysical
		_ = afterLogical
		result = append(result, p)
	}
	return result, nil
}

func (m *memStore) ListBranches(_ context.Context, deckID string) ([]string, error) {
	seen := make(map[string]bool)
	for key := range m.payloads {
		parts := bytes.SplitN([]byte(key), []byte(":"), 2)
		if len(parts) == 2 && string(parts[0]) == deckID {
			seen[string(parts[1])] = true
		}
	}
	if len(seen) == 0 {
		return []string{"main"}, nil
	}
	var branches []string
	for b := range seen {
		branches = append(branches, b)
	}
	return branches, nil
}

func (m *memStore) BranchMaxHLC(_ context.Context, deckID, branchID string, _, _ int64) (int64, int64, error) {
	key := deckID + ":" + branchID
	if len(m.payloads[key]) > 0 {
		return 500, 0, nil
	}
	return 0, 0, nil
}

func TestManager_CreateSnapshot(t *testing.T) {
	store := newMemStore()
	logger := zap.NewNop()

	// Seed: 3 payloads for deck-1/main.
	store.payloads["deck-1:main"] = [][]byte{
		{0x01, 0x02},
		{0x03, 0x04},
		{0x05, 0x06},
	}
	store.hlcs["deck-1"] = [2]int64{500, 0}

	mgr := NewManager(store, logger, 10, WithOpIDGenerator(func() string {
		return "snap-test-id"
	}))

	mgr.CreateSnapshot("deck-1")

	require.Len(t, store.snapshots, 1)
	snap := store.snapshots[0]
	assert.Equal(t, "snap-test-id", snap.OpID)
	assert.Equal(t, "deck-1", snap.DeckID)
	assert.Equal(t, "main", snap.BranchID)
	assert.Equal(t, int64(500), snap.HLCPhysical)

	// Payload should be non-empty gzip.
	assert.NotEmpty(t, snap.Payload)
}

func TestManager_OnOpsFlushed_TriggerSnapshot(t *testing.T) {
	store := newMemStore()
	logger := zap.NewNop()

	store.payloads["deck-x:main"] = [][]byte{{0xAA}}
	store.hlcs["deck-x"] = [2]int64{100, 0}

	mgr := NewManager(store, logger, 3) // snapshot every 3 ops

	// Flush 3 ops — should trigger snapshot.
	mgr.OnOpsFlushed([]OpInfo{
		{OpID: "a", DeckID: "deck-x", OpType: "yjs_update"},
		{OpID: "b", DeckID: "deck-x", OpType: "yjs_update"},
		{OpID: "c", DeckID: "deck-x", OpType: "yjs_update"},
	})

	// Wait for async snapshot.
	time.Sleep(200 * time.Millisecond)
	assert.Len(t, store.snapshots, 1)
}

func TestManager_OnOpsFlushed_NoTriggerUnderThreshold(t *testing.T) {
	store := newMemStore()
	logger := zap.NewNop()

	mgr := NewManager(store, logger, 10)

	mgr.OnOpsFlushed([]OpInfo{
		{OpID: "a", DeckID: "deck-y", OpType: "yjs_update"},
		{OpID: "b", DeckID: "deck-y", OpType: "yjs_update"},
	})

	time.Sleep(100 * time.Millisecond)
	assert.Empty(t, store.snapshots)
}

func TestManager_SkipsSnapshotOps(t *testing.T) {
	store := newMemStore()
	logger := zap.NewNop()

	mgr := NewManager(store, logger, 3)

	// Flush 3 snapshot ops — should NOT trigger (snapshot rows not counted).
	mgr.OnOpsFlushed([]OpInfo{
		{OpID: "s1", DeckID: "deck-z", OpType: "snapshot"},
		{OpID: "s2", DeckID: "deck-z", OpType: "snapshot"},
		{OpID: "s3", DeckID: "deck-z", OpType: "snapshot"},
	})

	time.Sleep(100 * time.Millisecond)
	assert.Empty(t, store.snapshots)
}

// ---------------------------------------------------------------------------
// PGXSnapshotStore integration tests
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

func TestPGXSnapshotStore_InsertAndQuery(t *testing.T) {
	pool := skipIfNoPostgres(t)
	defer pool.Close()

	ctx := context.Background()
	deckID := "snap-pgx-" + time.Now().Format("0102150405.000")
	seedDeck(t, pool, deckID)

	t.Cleanup(func() {
		pool.Exec(ctx, `DELETE FROM crdt_logs WHERE deck_id = $1`, deckID)
		pool.Exec(ctx, `DELETE FROM decks WHERE id = $1`, deckID)
	})

	store := NewPGXSnapshotStore(pool)

	// Insert a snapshot row (use unique op_id to avoid conflicts).
	snapOpID := "snap-" + deckID
	err := store.InsertSnapshotRow(ctx, SnapshotRow{
		OpID:        snapOpID,
		DeckID:      deckID,
		BranchID:    "main",
		HLCPhysical: 500,
		HLCLogical:  0,
		Payload:     []byte{0xDE, 0xAD},
	})
	require.NoError(t, err)

	// Query last snapshot HLC.
	phys, logi, err := store.LastSnapshotHLC(ctx, deckID)
	require.NoError(t, err)
	assert.Equal(t, int64(500), phys)
	assert.Equal(t, int64(0), logi)

	// List branches — snapshot rows are excluded from op_type != 'snapshot' queries
	// but the snapshot row itself is there, so we should get 'main' from the snapshot.
	branches, err := store.ListBranches(ctx, deckID)
	require.NoError(t, err)
	// ListBranches filters op_type != 'snapshot', so no branches unless we have non-snapshot ops.
	assert.Contains(t, branches, "main") // falls back to "main" when no branches found
}

func TestPGXSnapshotStore_RoundTrip(t *testing.T) {
	pool := skipIfNoPostgres(t)
	defer pool.Close()

	ctx := context.Background()
	deckID := "snap-round-" + time.Now().Format("0102150405.000")
	seedDeck(t, pool, deckID)

	t.Cleanup(func() {
		pool.Exec(ctx, `DELETE FROM crdt_logs WHERE deck_id = $1`, deckID)
		pool.Exec(ctx, `DELETE FROM decks WHERE id = $1`, deckID)
	})

	// Insert 3 Yjs update ops with payloads.
	payloads := [][]byte{
		{0x01, 0x02, 0x03},
		{0x04, 0x05},
		{0x06, 0x07, 0x08, 0x09},
	}
	for i, p := range payloads {
		_, err := pool.Exec(ctx,
			`INSERT INTO crdt_logs (op_id, deck_id, branch_id, author_id, hlc_physical, hlc_logical, op_type, payload)
			 VALUES ($1, $2, 'main', 'user-1', $3, 0, 'yjs_update', $4)
			 ON CONFLICT (op_id) DO NOTHING`,
			deckID+"-op-"+string(rune('a'+i)), deckID, int64(100+i), p,
		)
		require.NoError(t, err)
	}

	// Compress payloads into a snapshot.
	compressed, err := compressPayloads(payloads)
	require.NoError(t, err)

	// Insert snapshot.
	err = NewPGXSnapshotStore(pool).InsertSnapshotRow(ctx, SnapshotRow{
		OpID:        deckID + "-snap",
		DeckID:      deckID,
		BranchID:    "main",
		HLCPhysical: 102,
		HLCLogical:  0,
		Payload:     compressed,
	})
	require.NoError(t, err)

	// Read back the snapshot payload and decompress.
	var rawPayload []byte
	err = pool.QueryRow(ctx,
		`SELECT payload FROM crdt_logs WHERE deck_id = $1 AND op_type = 'snapshot' ORDER BY hlc_physical DESC LIMIT 1`,
		deckID,
	).Scan(&rawPayload)
	require.NoError(t, err)

	gz, err := gzip.NewReader(bytes.NewReader(rawPayload))
	require.NoError(t, err)
	defer gz.Close()

	decompressed, err := io.ReadAll(gz)
	require.NoError(t, err)

	// Parse length-prefixed payloads.
	var roundTripped [][]byte
	off := 0
	for off < len(decompressed) {
		size := binary.BigEndian.Uint32(decompressed[off : off+4])
		off += 4
		roundTripped = append(roundTripped, decompressed[off:off+int(size)])
		off += int(size)
	}

	assert.Equal(t, payloads, roundTripped)
}
