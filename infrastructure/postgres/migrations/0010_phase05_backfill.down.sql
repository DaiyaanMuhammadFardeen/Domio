-- Roll back migration 0010_phase05_backfill.up.sql.
-- The backfill is idempotent and additive; reverting it would lose
-- data. This is a no-op down migration.

-- Intentionally empty — backfill is irreversible without backup.
SELECT 1;
