-- 0091_phase19_partner_webhooks.down.sql
-- Phase 19: Reverse partner_webhooks — drop tables in dependency order.
-- ---------------------------------------------------------------------------

BEGIN;

DROP TABLE IF EXISTS webhook_delivery CASCADE;
DROP TABLE IF EXISTS partner_client CASCADE;

COMMIT;
