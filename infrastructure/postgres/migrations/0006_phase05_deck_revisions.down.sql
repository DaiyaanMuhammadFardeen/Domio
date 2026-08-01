-- Roll back migration 0006_phase05_deck_revisions.up.sql.
-- Reverses: decks (current_revision, current_branch, crdt_snapshot_object_key),
--           deck_versions (branch_id, diff_object_key),
--           crdt_logs (branch_id NOT NULL, op_kind, byte_size).

BEGIN;

-- ---------------------------------------------------------------------------
-- crdt_logs — drop added columns, restore NOT NULL on branch_id.
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS crdt_logs_deck_branch_op_kind_idx;

ALTER TABLE crdt_logs
    DROP COLUMN IF EXISTS op_kind;

ALTER TABLE crdt_logs
    DROP COLUMN IF EXISTS byte_size;

ALTER TABLE crdt_logs
    ALTER COLUMN branch_id SET NOT NULL;

-- ---------------------------------------------------------------------------
-- deck_versions — drop added columns.
-- ---------------------------------------------------------------------------
ALTER TABLE deck_versions
    DROP COLUMN IF EXISTS branch_id;

ALTER TABLE deck_versions
    DROP COLUMN IF EXISTS diff_object_key;

-- ---------------------------------------------------------------------------
-- decks — drop snapshot key, rename current_branch back to branch,
-- demote current_revision to integer.
-- ---------------------------------------------------------------------------
ALTER TABLE decks
    DROP COLUMN IF EXISTS crdt_snapshot_object_key;

ALTER TABLE decks
    RENAME COLUMN current_branch TO branch;

ALTER TABLE decks
    ALTER COLUMN current_revision TYPE integer USING current_revision::integer;

COMMIT;
