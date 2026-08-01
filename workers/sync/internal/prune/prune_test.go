package prune

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

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
	// Ensure the deck exists (required by FK from crdt_logs).
	_, err := pool.Exec(ctx,
		`INSERT INTO tenants (tenant_id, display_name) VALUES ('test-tenant', 'Test') ON CONFLICT DO NOTHING`)
	if err != nil {
		t.Fatalf("seed tenant: %v", err)
	}
	_, err = pool.Exec(ctx,
		`INSERT INTO workspaces (workspace_id, tenant_id, name) VALUES ('test-ws', 'test-tenant', 'Test WS') ON CONFLICT DO NOTHING`)
	if err != nil {
		t.Fatalf("seed workspace: %v", err)
	}
	_, err = pool.Exec(ctx,
		`INSERT INTO decks (id, workspace_id, tenant_id, title, schema_version, owner_id)
		 VALUES ($1, 'test-ws', 'test-tenant', 'Test Deck', '1.0', 'user-1')
		 ON CONFLICT (id) DO NOTHING`,
		deckID,
	)
	if err != nil {
		t.Fatalf("seed deck: %v", err)
	}
}

func TestPrune_DeletesOldPreservesRecent(t *testing.T) {
	pool := skipIfNoPostgres(t)
	defer pool.Close()

	ctx := context.Background()
	deckID := "prune-test-deck-" + time.Now().Format("0102150405")
	seedDeck(t, pool, deckID)
	t.Cleanup(func() {
		pool.Exec(ctx, `DELETE FROM crdt_logs WHERE deck_id = $1`, deckID)
		pool.Exec(ctx, `DELETE FROM decks WHERE id = $1`, deckID)
	})

	now := time.Now()
	oldTime := now.Add(-60 * 24 * time.Hour) // 60 days ago
	recentTime := now.Add(-1 * time.Hour)     // 1 hour ago

	// Insert 3 old ops (60 days ago).
	for i := 0; i < 3; i++ {
		_, err := pool.Exec(ctx,
			`INSERT INTO crdt_logs (op_id, deck_id, branch_id, author_id, hlc_physical, hlc_logical, op_type, payload, applied_at)
			 VALUES ($1, $2, 'main', 'user-1', $3, 0, 'yjs_update', '\x01', $4)
			 ON CONFLICT (op_id) DO NOTHING`,
			deckID+"-old-"+string(rune('A'+i)), deckID, int64(1000+i), oldTime,
		)
		if err != nil {
			t.Fatalf("insert old op: %v", err)
		}
	}

	// Insert 2 recent ops (1 hour ago).
	for i := 0; i < 2; i++ {
		_, err := pool.Exec(ctx,
			`INSERT INTO crdt_logs (op_id, deck_id, branch_id, author_id, hlc_physical, hlc_logical, op_type, payload, applied_at)
			 VALUES ($1, $2, 'main', 'user-1', $3, 0, 'yjs_update', '\x01', $4)
			 ON CONFLICT (op_id) DO NOTHING`,
			deckID+"-recent-"+string(rune('A'+i)), deckID, int64(5000+i), recentTime,
		)
		if err != nil {
			t.Fatalf("insert recent op: %v", err)
		}
	}

	// Prune everything older than 30 days.
	cutoff := now.Add(-30 * 24 * time.Hour)
	stats, err := Prune(ctx, pool, cutoff)
	if err != nil {
		t.Fatalf("Prune: %v", err)
	}

	if stats.RowsDeleted != 3 {
		t.Errorf("expected 3 rows deleted, got %d", stats.RowsDeleted)
	}

	// Verify recent ops still exist.
	var count int
	err = pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM crdt_logs WHERE deck_id = $1 AND op_type != 'snapshot'`,
		deckID,
	).Scan(&count)
	if err != nil {
		t.Fatalf("count remaining ops: %v", err)
	}
	if count != 2 {
		t.Errorf("expected 2 remaining recent ops, got %d", count)
	}
}

func TestPrune_PreservesSnapshots(t *testing.T) {
	pool := skipIfNoPostgres(t)
	defer pool.Close()

	ctx := context.Background()
	deckID := "prune-snap-deck-" + time.Now().Format("0102150405")
	seedDeck(t, pool, deckID)
	t.Cleanup(func() {
		pool.Exec(ctx, `DELETE FROM crdt_logs WHERE deck_id = $1`, deckID)
		pool.Exec(ctx, `DELETE FROM decks WHERE id = $1`, deckID)
	})

	oldTime := time.Now().Add(-60 * 24 * time.Hour)

	// Insert an old op.
	_, err := pool.Exec(ctx,
		`INSERT INTO crdt_logs (op_id, deck_id, branch_id, author_id, hlc_physical, hlc_logical, op_type, payload, applied_at)
		 VALUES ($1, $2, 'main', 'user-1', 100, 0, 'yjs_update', '\x01', $3)
		 ON CONFLICT (op_id) DO NOTHING`,
		deckID+"-old", deckID, oldTime,
	)
	if err != nil {
		t.Fatalf("insert old op: %v", err)
	}

	// Insert an old snapshot that subsumes the old op (same HLC or higher).
	_, err = pool.Exec(ctx,
		`INSERT INTO crdt_logs (op_id, deck_id, branch_id, author_id, hlc_physical, hlc_logical, op_type, payload, applied_at)
		 VALUES ($1, $2, 'main', 'system', 200, 0, 'snapshot', '\x02', $3)
		 ON CONFLICT (op_id) DO NOTHING`,
		deckID+"-snap", deckID, oldTime,
	)
	if err != nil {
		t.Fatalf("insert snapshot: %v", err)
	}

	cutoff := time.Now().Add(-30 * 24 * time.Hour)
	stats, err := Prune(ctx, pool, cutoff)
	if err != nil {
		t.Fatalf("Prune: %v", err)
	}

	// The old op should be deleted (HLC 100 < snapshot HLC 200).
	if stats.RowsDeleted != 1 {
		t.Errorf("expected 1 row deleted, got %d", stats.RowsDeleted)
	}

	// Snapshot should survive.
	var snapCount int
	err = pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM crdt_logs WHERE deck_id = $1 AND op_type = 'snapshot'`,
		deckID,
	).Scan(&snapCount)
	if err != nil {
		t.Fatalf("count snapshots: %v", err)
	}
	if snapCount != 1 {
		t.Errorf("expected 1 snapshot preserved, got %d", snapCount)
	}
}

func TestPrune_RecentOpsSurvive(t *testing.T) {
	pool := skipIfNoPostgres(t)
	defer pool.Close()

	ctx := context.Background()
	deckID := "prune-recent-" + time.Now().Format("0102150405.000")
	seedDeck(t, pool, deckID)
	t.Cleanup(func() {
		pool.Exec(ctx, `DELETE FROM crdt_logs WHERE deck_id = $1`, deckID)
		pool.Exec(ctx, `DELETE FROM decks WHERE id = $1`, deckID)
	})

	// Insert a fresh op (applied_at = now).
	_, err := pool.Exec(ctx,
		`INSERT INTO crdt_logs (op_id, deck_id, branch_id, author_id, hlc_physical, hlc_logical, op_type, payload)
		 VALUES ($1, $2, 'main', 'user-1', 999, 0, 'yjs_update', '\x01')
		 ON CONFLICT (op_id) DO NOTHING`,
		deckID+"-fresh", deckID,
	)
	require.NoError(t, err)

	// Prune with cutoff 1 second in the past; the fresh op should survive.
	cutoff := time.Now().Add(-1 * time.Second)
	stats, err := Prune(ctx, pool, cutoff)
	if err != nil {
		t.Fatalf("Prune: %v", err)
	}

	// The fresh op should NOT be deleted (applied_at ≈ now(), not < now()).
	var count int
	err = pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM crdt_logs WHERE op_id = $1`,
		deckID+"-fresh",
	).Scan(&count)
	require.NoError(t, err)
	assert.Equal(t, 1, count, "fresh op should survive pruning")
	_ = stats
}
