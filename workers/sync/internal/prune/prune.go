// Package prune provides op-log retention management for the sync worker.
//
// Prune deletes old CRDT operations from crdt_logs while preserving:
//   - Snapshot rows (op_type = 'snapshot')
//   - Ops that are newer than the latest snapshot for their deck
//
// This bounded-retention strategy keeps the event log compact while
// ensuring that snapshot + tail replay always reconstructs state.
package prune

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Stats reports the outcome of a prune run.
type Stats struct {
	RowsDeleted int64
}

// Prune removes CRDT ops older than the given cutoff time.
//
// It preserves:
//   - Snapshot rows (op_type = 'snapshot')
//   - Ops whose HLC is newer than the latest snapshot for their deck
//
// Returns the number of rows deleted.
func Prune(ctx context.Context, pool *pgxpool.Pool, before time.Time) (Stats, error) {
	result, err := pool.Exec(ctx,
		`DELETE FROM crdt_logs
		 WHERE op_id IN (
		   SELECT cl.op_id
		   FROM crdt_logs cl
		   LEFT JOIN LATERAL (
		     SELECT hlc_physical, hlc_logical
		     FROM crdt_logs snap
		     WHERE snap.deck_id = cl.deck_id AND snap.op_type = 'snapshot'
		     ORDER BY snap.hlc_physical DESC, snap.hlc_logical DESC
		     LIMIT 1
		   ) latest ON true
		   WHERE cl.applied_at < $1
		     AND cl.op_type != 'snapshot'
		     AND (
		       latest IS NULL
		       OR cl.hlc_physical < latest.hlc_physical
		       OR (cl.hlc_physical = latest.hlc_physical
		           AND cl.hlc_logical <= latest.hlc_logical)
		     )
		 )`,
		before,
	)
	if err != nil {
		return Stats{}, fmt.Errorf("prune: %w", err)
	}

	return Stats{RowsDeleted: result.RowsAffected()}, nil
}
