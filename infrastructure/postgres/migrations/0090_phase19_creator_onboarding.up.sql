-- 0090_phase19_creator_onboarding.up.sql
-- Phase 19 WS-MKT-6: Creator onboarding state machine + rescreen hits + statements.
--
-- Alters:
--   creator_profile — add onboarding_state enum column for the creator
--     onboarding state machine (pending → profile_complete → kyc_required →
--     kyc_submitted → kyc_approved → payout_ready → active).
--
-- Tables:
--   kyc_rescreen_hit  — one row per PEP/sanctions hit from periodic rescreening.
--   statement_record  — per-period PDF statement metadata for creators.
--
-- NOTE on creator_profile RLS: creator_profile is user-scoped (no workspace_id,
-- see 0079). The ALTER adds a data column only — no RLS changes needed.
--
-- RLS on new tables: workspace-scoped (tenant isolation via workspace_id).
-- ---------------------------------------------------------------------------

BEGIN;

-- ---------------------------------------------------------------------------
-- creator_profile — add onboarding_state for the state machine.
-- onboarding_state: tracks where a creator is in the onboarding flow.
--   pending | profile_complete | kyc_required | kyc_submitted |
--   kyc_approved | payout_ready | active
-- ---------------------------------------------------------------------------
ALTER TABLE creator_profile
    ADD COLUMN IF NOT EXISTS onboarding_state text NOT NULL DEFAULT 'pending'
        CHECK (onboarding_state IN (
            'pending', 'profile_complete', 'kyc_required',
            'kyc_submitted', 'kyc_approved', 'payout_ready', 'active'
        ));

-- ---------------------------------------------------------------------------
-- kyc_rescreen_hit — PEP/sanctions screening hit from nightly rescreen job.
-- kind: pep | sanctions — type of screening match.
-- matched_entity: the entity name or identifier that triggered the hit.
-- decision: freeze | review — what action was taken on this hit.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kyc_rescreen_hit (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    uuid NOT NULL,
    creator_id      uuid NOT NULL REFERENCES creator_profile (id) ON DELETE CASCADE,
    kind            text NOT NULL
                    CHECK (kind IN ('pep', 'sanctions')),
    matched_entity  text NOT NULL,
    decision        text NOT NULL
                    CHECK (decision IN ('freeze', 'review')),
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kyc_rescreen_hit_creator_idx
    ON kyc_rescreen_hit (creator_id);

-- ---------------------------------------------------------------------------
-- statement_record — per-period PDF statement for creators.
-- kind: monthly | yearly_1099k — statement type.
-- period_month: 'YYYY-MM' human-readable period key.
-- total_gross_cents / total_fee_cents / total_net_cents: aggregated amounts
--   for the period (bigint cents, no floats).
-- payload: full statement data as JSON (used to render the PDF).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS statement_record (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id        uuid NOT NULL,
    creator_id          uuid NOT NULL REFERENCES creator_profile (id) ON DELETE CASCADE,
    period_month        text NOT NULL,
    kind                text NOT NULL
                        CHECK (kind IN ('monthly', 'yearly_1099k')),
    total_gross_cents   bigint NOT NULL DEFAULT 0,
    total_fee_cents     bigint NOT NULL DEFAULT 0,
    total_net_cents     bigint NOT NULL DEFAULT 0,
    currency            char(3) NOT NULL DEFAULT 'USD',
    payload             jsonb NOT NULL DEFAULT '{}'::jsonb,
    generated_at        timestamptz NOT NULL DEFAULT now(),
    created_by          uuid
);

CREATE INDEX IF NOT EXISTS statement_record_creator_idx
    ON statement_record (creator_id, period_month);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'kyc_rescreen_hit',
        'statement_record'
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
