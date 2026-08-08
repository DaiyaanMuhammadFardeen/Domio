-- 0086_phase19_seed_payout_policy.up.sql
-- Phase 19 WS-MKT-7: Default payout policy constants (singleton config).
--
-- Tables:
--   payout_policy — single-row config table with default payout policy.
--     Seeded with: 70/30 creator/platform split, $50 minimum payout,
--     30-day first-payout hold (per doc §5.3 step 8).
--
-- RLS DECISION: GLOBAL singleton config. No workspace_id. RLS omitted;
-- the payout policy is platform-wide, not per-tenant.
-- ---------------------------------------------------------------------------

BEGIN;

-- ---------------------------------------------------------------------------
-- payout_policy — singleton payout configuration.
-- Only one row is ever expected (enforced by application logic).
-- split_creator_bps: basis points for creator share (7000 = 70%).
-- split_platform_bps: basis points for platform share (3000 = 30%).
-- min_payout_cents: minimum payout threshold in integer cents ($50 = 5000).
-- first_payout_hold_days: hold period for a creator's first payout (30 days).
-- updated_at: last time the policy was modified.
-- updated_by: who last modified the policy (NULL for seed row).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payout_policy (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    split_creator_bps       int NOT NULL DEFAULT 7000,
    split_platform_bps      int NOT NULL DEFAULT 3000,
    min_payout_cents        bigint NOT NULL DEFAULT 5000,
    first_payout_hold_days  int NOT NULL DEFAULT 30,
    updated_at              timestamptz NOT NULL DEFAULT now(),
    updated_by              uuid
);

-- Seed the default payout policy (single row).
INSERT INTO payout_policy (id, split_creator_bps, split_platform_bps, min_payout_cents, first_payout_hold_days)
VALUES (gen_random_uuid(), 7000, 3000, 5000, 30);

-- No RLS: global singleton, not tenant-scoped.

COMMIT;
