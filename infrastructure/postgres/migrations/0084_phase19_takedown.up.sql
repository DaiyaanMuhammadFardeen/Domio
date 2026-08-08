-- 0084_phase19_takedown.up.sql
-- Phase 19 WS-MKT-8: Takedown (DMCA/trademark/policy) + trust scoring.
--
-- Tables:
--   takedown_request — DMCA/trademark/policy complaint filing + resolution.
--   trust_score      — computed trust score per listing (global, no workspace).
--
-- RLS DECISION:
--   takedown_request: workspace-scoped. RLS enabled.
--   trust_score: GLOBAL table (trust scores are per-listing, computed by
--     a global trust scanner). No workspace_id. RLS omitted; the listing's
--     own marketplace_listing RLS governs access at the listing level.
-- ---------------------------------------------------------------------------

BEGIN;

-- ---------------------------------------------------------------------------
-- takedown_request — copyright (DMCA), trademark, or policy violation filing.
-- listing_id: FK to P06 marketplace_listing(id) — the targeted listing.
-- claimant_id: user who filed the takedown.
-- kind: dmca | trademark | policy.
-- status: received | in_review | confirmed | dismissed | counter_notice | resolved.
-- evidence_url: URL to supporting evidence document.
-- statement: good-faith statement (DMCA §512(c) elements).
-- resolution_notes: admin notes on resolution.
-- submitted_at: when the filing was submitted.
-- resolved_at: when the takedown was resolved (NULL = pending).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS takedown_request (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id        uuid NOT NULL,
    listing_id          uuid NOT NULL REFERENCES marketplace_listing (id) ON DELETE CASCADE,
    claimant_id         text NOT NULL,
    kind                text NOT NULL
                        CHECK (kind IN ('dmca', 'trademark', 'policy')),
    evidence_url        text,
    statement           text NOT NULL,
    status              text NOT NULL DEFAULT 'received'
                        CHECK (status IN ('received', 'in_review', 'confirmed', 'dismissed', 'counter_notice', 'resolved')),
    resolution_notes    text,
    submitted_at        timestamptz NOT NULL DEFAULT now(),
    resolved_at         timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid
);

CREATE INDEX IF NOT EXISTS takedown_request_listing_idx
    ON takedown_request (listing_id);
CREATE INDEX IF NOT EXISTS takedown_request_status_idx
    ON takedown_request (status, submitted_at DESC);

-- ---------------------------------------------------------------------------
-- trust_score — computed trust score for a listing.
-- listing_id: FK to P06 marketplace_listing(id).
-- score: numeric trust score (0.0–1.0 or similar scale).
-- signals: JSON blob of individual trust signals (malware scan, pricing
--   anomaly, review sentiment, etc.) computed by the trust scanner.
-- computed_at: when the score was last computed.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trust_score (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id      uuid NOT NULL REFERENCES marketplace_listing (id) ON DELETE CASCADE,
    score           numeric(5, 4) NOT NULL DEFAULT 0,
    signals         jsonb NOT NULL DEFAULT '{}'::jsonb,
    computed_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trust_score_listing_idx
    ON trust_score (listing_id);

-- No RLS on trust_score: global trust data, not tenant-scoped.
-- Listing-level access is governed by marketplace_listing RLS.

-- ---------------------------------------------------------------------------
-- RLS — takedown_request only (workspace-scoped).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'takedown_request'
    ] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = 'public' AND tablename = t
              AND policyname = t || '_tenant_isolation'
        ) THEN
            EXECUTE format(
                'CREATE POLICY %I ON %I USING (
                    workspace_id::text = current_setting(''app.tenant_id'', true)
                    OR current_setting(''app.bypass_rls'', true) = ''on''
                ) WITH CHECK (
                    workspace_id::text = current_setting(''app.tenant_id'', true)
                    OR current_setting(''app.bypass_rls'', true) = ''on''
                )',
                t || '_tenant_isolation', t
            );
        END IF;
    END LOOP;
END $$;

COMMIT;
