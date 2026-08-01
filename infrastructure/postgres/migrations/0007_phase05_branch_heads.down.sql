-- Roll back migration 0007_phase05_branch_heads.up.sql.

BEGIN;

ALTER TABLE branch_heads
    DROP COLUMN IF EXISTS revision;

COMMIT;
