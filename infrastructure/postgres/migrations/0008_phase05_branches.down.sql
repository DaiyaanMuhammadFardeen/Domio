-- Roll back migration 0008_phase05_branches.up.sql.

BEGIN;

DROP TABLE IF EXISTS branches;

COMMIT;
