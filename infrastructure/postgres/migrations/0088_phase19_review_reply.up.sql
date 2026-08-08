-- 0088_phase19_review_reply.up.sql
-- Phase 19 WS-MKT-3/4: Review replies + payment_intent dispute/refund columns.
--
-- Alters:
--   marketplace_review — add creator reply columns (reply, replied_by, replied_at).
--   payment_intent     — add dispute_status, refund_status, refunded_at,
--                         refund_reason for refund/chargeback lifecycle tracking.
--
-- NOTE: marketplace_review has no workspace_id column (P06 schema); RLS was
-- enabled on it in 0013 but has no tenant policy. These ALTERs add data
-- columns only — no RLS changes needed.
-- ---------------------------------------------------------------------------

BEGIN;

-- ---------------------------------------------------------------------------
-- marketplace_review — add creator reply support.
-- reply: the creator's text reply to this review.
-- replied_by: user_id of the creator who replied (text, matches reviewer_id).
-- replied_at: timestamp of the reply.
-- ---------------------------------------------------------------------------
ALTER TABLE marketplace_review
    ADD COLUMN IF NOT EXISTS reply text,
    ADD COLUMN IF NOT EXISTS replied_by text,
    ADD COLUMN IF NOT EXISTS replied_at timestamptz;

-- ---------------------------------------------------------------------------
-- payment_intent — add dispute/refund lifecycle tracking.
-- dispute_status: tracks Stripe dispute state separate from payment status.
-- refund_status: tracks refund request → approval → execution lifecycle.
-- refunded_at: when the refund was actually executed.
-- refund_reason: buyer-supplied or system-generated reason for the refund.
-- ---------------------------------------------------------------------------
ALTER TABLE payment_intent
    ADD COLUMN IF NOT EXISTS dispute_status text NOT NULL DEFAULT 'none'
        CHECK (dispute_status IN ('none', 'opened', 'won', 'lost', 'resolved')),
    ADD COLUMN IF NOT EXISTS refund_status text NOT NULL DEFAULT 'none'
        CHECK (refund_status IN ('none', 'requested', 'approved', 'refunded')),
    ADD COLUMN IF NOT EXISTS refunded_at timestamptz,
    ADD COLUMN IF NOT EXISTS refund_reason text;

COMMIT;
