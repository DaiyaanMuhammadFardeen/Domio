-- 0089_phase19_chargeback.up.sql
-- Phase 19 WS-MKT-4: Chargeback freeze + subscription grace/revocation.
--
-- Alters:
--   marketplace_listing — add frozen_for / frozen_at for dispute/takedown freeze.
--   subscription        — add canceled_at, grace_ends_at, revoked_at for
--                          cancellation + 7-day grace + revocation lifecycle.
--
-- NOTE: marketplace_listing has no workspace_id column (P06 schema); RLS was
-- enabled on it in 0013 but has no tenant policy. These ALTERs add data
-- columns only — no RLS changes needed.
-- ---------------------------------------------------------------------------

BEGIN;

-- ---------------------------------------------------------------------------
-- marketplace_listing — chargeback/takedown freeze support.
-- frozen_for: reason for the freeze ('dispute' or 'takedown'); NULL = not frozen.
-- frozen_at: when the listing was frozen (NULL = not frozen).
-- While frozen, the listing does not accept new purchases.
-- ---------------------------------------------------------------------------
ALTER TABLE marketplace_listing
    ADD COLUMN IF NOT EXISTS frozen_for text
        CHECK (frozen_for IN ('dispute', 'takedown')),
    ADD COLUMN IF NOT EXISTS frozen_at timestamptz;

-- ---------------------------------------------------------------------------
-- subscription — cancellation + grace period + revocation lifecycle.
-- canceled_at: when the subscription was canceled (NULL = active).
-- grace_ends_at: when the 7-day post-cancellation grace period expires;
--   license remains valid until this timestamp.
-- revoked_at: when the license was actually revoked after grace period expiry.
-- ---------------------------------------------------------------------------
ALTER TABLE subscription
    ADD COLUMN IF NOT EXISTS canceled_at timestamptz,
    ADD COLUMN IF NOT EXISTS grace_ends_at timestamptz,
    ADD COLUMN IF NOT EXISTS revoked_at timestamptz;

COMMIT;
