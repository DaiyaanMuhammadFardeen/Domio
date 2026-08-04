-- 0031_phase10_telemetry.down.sql
-- Roll back Phase 10 M5 telemetry tables.
BEGIN;
DROP TABLE IF EXISTS integrity_chain;
DROP TABLE IF EXISTS prototype_events;
DROP TABLE IF EXISTS prototype_sessions;
COMMIT;
