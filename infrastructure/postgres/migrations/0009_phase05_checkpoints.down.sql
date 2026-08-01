-- Roll back migration 0009_phase05_checkpoints.up.sql.
-- Child tables dropped before parents.

BEGIN;

DROP TABLE IF EXISTS merge_requests;
DROP TABLE IF EXISTS checkpoints;

COMMIT;
