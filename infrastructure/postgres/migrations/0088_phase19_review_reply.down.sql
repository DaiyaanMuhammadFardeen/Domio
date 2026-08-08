-- 0088_phase19_review_reply.down.sql
-- Phase 19: Reverse review_reply + payment_intent dispute/refund columns.
-- ---------------------------------------------------------------------------

BEGIN;

ALTER TABLE payment_intent
    DROP COLUMN IF EXISTS refund_reason,
    DROP COLUMN IF EXISTS refunded_at,
    DROP COLUMN IF EXISTS refund_status,
    DROP COLUMN IF EXISTS dispute_status;

ALTER TABLE marketplace_review
    DROP COLUMN IF EXISTS replied_at,
    DROP COLUMN IF EXISTS replied_by,
    DROP COLUMN IF EXISTS reply;

COMMIT;
