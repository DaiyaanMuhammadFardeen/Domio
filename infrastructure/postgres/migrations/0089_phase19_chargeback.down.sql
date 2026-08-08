-- 0089_phase19_chargeback.down.sql
-- Phase 19: Reverse chargeback freeze + subscription grace/revocation columns.
-- ---------------------------------------------------------------------------

BEGIN;

ALTER TABLE subscription
    DROP COLUMN IF EXISTS revoked_at,
    DROP COLUMN IF EXISTS grace_ends_at,
    DROP COLUMN IF EXISTS canceled_at;

ALTER TABLE marketplace_listing
    DROP COLUMN IF EXISTS frozen_at,
    DROP COLUMN IF EXISTS frozen_for;

COMMIT;
