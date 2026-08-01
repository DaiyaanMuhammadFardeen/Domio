-- Migration 0007: Phase 05 branch heads — extend the existing branch_heads
-- table with a revision column for revision tracking per branch.
--
-- branch_heads was created in 0004 (Phase 04) with (deck_id, branch_id,
-- hlc_physical, hlc_logical, updated_at). This migration adds `revision`
-- to track the monotonic revision number per branch head.

BEGIN;

-- ---------------------------------------------------------------------------
-- branch_heads — add revision for revision tracking.
-- ---------------------------------------------------------------------------
ALTER TABLE branch_heads
    ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0;

COMMIT;
