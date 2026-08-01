-- Migration 0010: Phase 05 backfill — idempotent, re-runnable backfill
-- for legacy rows created before Phase 05.
--
-- 1. crdt_logs: assign branch_id = 'main' where NULL (legacy ops).
-- 2. decks: set current_revision from max crdt_logs hlc_physical per deck.
-- 3. deck_versions: set branch_id = 'main' where NULL.
--
-- This migration is safe to re-run: all UPDATEs use WHERE clauses that
-- become no-ops once the backfill is complete.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Backfill crdt_logs.branch_id for legacy rows (created before P05).
-- ---------------------------------------------------------------------------
UPDATE crdt_logs
    SET branch_id = 'main'
    WHERE branch_id IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Backfill decks.current_revision from max op count per deck.
--    Only touches rows where current_revision is still 0 (untouched).
-- ---------------------------------------------------------------------------
UPDATE decks d
    SET current_revision = COALESCE(sub.max_rev, 0)
    FROM (
        SELECT deck_id, COUNT(*) AS max_rev
        FROM crdt_logs
        GROUP BY deck_id
    ) sub
    WHERE d.id = sub.deck_id
      AND d.current_revision = 0;

-- ---------------------------------------------------------------------------
-- 3. Backfill deck_versions.branch_id for legacy rows.
-- ---------------------------------------------------------------------------
UPDATE deck_versions
    SET branch_id = 'main'
    WHERE branch_id IS NULL;

-- ---------------------------------------------------------------------------
-- 4. Backfill branch_heads.revision from decks.current_revision.
-- ---------------------------------------------------------------------------
UPDATE branch_heads bh
    SET revision = d.current_revision
    FROM decks d
    WHERE bh.deck_id = d.id
      AND bh.revision = 0;

COMMIT;
