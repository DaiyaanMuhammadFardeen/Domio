-- Roll back migration 0004_phase04_crdt.up.sql.
-- Child tables (crdt_logs) dropped before parents (branch_heads).

BEGIN;

DROP TABLE IF EXISTS crdt_logs;
DROP TABLE IF EXISTS branch_heads;

COMMIT;
