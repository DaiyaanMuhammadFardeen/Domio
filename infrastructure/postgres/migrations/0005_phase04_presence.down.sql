-- Roll back migration 0005_phase04_presence.up.sql.

BEGIN;

DROP TABLE IF EXISTS presence_sessions;

COMMIT;
