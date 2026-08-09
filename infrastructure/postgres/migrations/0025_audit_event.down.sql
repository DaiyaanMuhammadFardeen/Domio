-- Migration 0025: lightweight audit log (down).
-- Best-effort. Production deployments do not roll forward migrations back.

BEGIN;

DROP TABLE IF EXISTS audit_retention_run;
DROP TABLE IF EXISTS audit_event;

COMMIT;