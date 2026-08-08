-- 0085_phase19_audit.down.sql
-- Phase 19: Drop marketplace_audit_event.
-- ---------------------------------------------------------------------------

BEGIN;

DROP TABLE IF EXISTS marketplace_audit_event CASCADE;

COMMIT;
