-- Migration 0006: Phase 05 deck revisions — extend decks, deck_versions,
-- and crdt_logs for persistence, versioning, and branching.
--
-- Changes:
--   decks:           + current_revision → bigint (was integer),
--                    rename branch → current_branch,
--                    + crdt_snapshot_object_key text
--   deck_versions:   + branch_id text NULL, + diff_object_key text
--   crdt_logs:       make branch_id nullable, + op_kind text, + byte_size int

BEGIN;

-- ---------------------------------------------------------------------------
-- decks — promote current_revision to bigint, rename branch, add snapshot key.
-- ---------------------------------------------------------------------------
ALTER TABLE decks
    ALTER COLUMN current_revision TYPE bigint USING current_revision::bigint;

ALTER TABLE decks
    RENAME COLUMN branch TO current_branch;

ALTER TABLE decks
    ADD COLUMN IF NOT EXISTS crdt_snapshot_object_key text;

-- ---------------------------------------------------------------------------
-- deck_versions — add branch_id and diff_object_key.
-- ---------------------------------------------------------------------------
ALTER TABLE deck_versions
    ADD COLUMN IF NOT EXISTS branch_id text NULL;

ALTER TABLE deck_versions
    ADD COLUMN IF NOT EXISTS diff_object_key text;

-- ---------------------------------------------------------------------------
-- crdt_logs — make branch_id nullable (legacy rows get 'main' via backfill),
-- add op_kind and byte_size.
-- ---------------------------------------------------------------------------
ALTER TABLE crdt_logs
    ALTER COLUMN branch_id DROP NOT NULL;

ALTER TABLE crdt_logs
    ADD COLUMN IF NOT EXISTS op_kind text NOT NULL DEFAULT 'crdt';

ALTER TABLE crdt_logs
    ADD COLUMN IF NOT EXISTS byte_size int NOT NULL DEFAULT 0;

-- Index for branch-aware queries (deck_id, branch_id).
CREATE INDEX IF NOT EXISTS crdt_logs_deck_branch_op_kind_idx
    ON crdt_logs (deck_id, branch_id, op_kind);

COMMIT;
