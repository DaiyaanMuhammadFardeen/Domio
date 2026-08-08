-- 0071_phase18_expiry.up.sql
-- Phase 18 W3: Expiry policies + freshness flags for content lifecycle.
--
-- Tables:
--   expiry_policy — defines expiration intervals and escalation for resources.
--   freshness_flag — tracks overdue/manual/AI-detected freshness issues.

BEGIN;

-- ---------------------------------------------------------------------------
-- expiry_policy — defines expiration intervals and escalation for resources.
-- resource_type/resource_id: polymorphic FK to the resource being governed.
-- interval_days: how often the resource must be reviewed (CHECK > 0).
-- escalation: 'gentle' | 'moderate' | 'strict'
-- auto_revoke_share: if true, revoke share links when policy expires.
-- responsible_id: optional UUID of the person responsible for review.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS expiry_policy (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id         uuid NOT NULL,
    resource_type        text NOT NULL,
    resource_id          uuid NOT NULL,
    interval_days        int NOT NULL CHECK (interval_days > 0),
    responsible_id       uuid,
    escalation           text NOT NULL DEFAULT 'gentle'
                         CHECK (escalation IN ('gentle','moderate','strict')),
    auto_revoke_share    boolean NOT NULL DEFAULT false,
    created_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid
);

CREATE INDEX IF NOT EXISTS expiry_policy_resource_idx ON expiry_policy (resource_type, resource_id);

-- ---------------------------------------------------------------------------
-- freshness_flag — tracks overdue/manual/AI-detected freshness issues.
-- reason: 'policy_overdue' | 'manual' | 'ai_detected'
-- resolved_at: null means still flagged; set when resolved.
-- Partial index on resolved_at IS NULL for fast "active flags" queries.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS freshness_flag (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id         uuid NOT NULL,
    resource_type        text NOT NULL,
    resource_id          uuid NOT NULL,
    flagged_at           timestamptz NOT NULL DEFAULT now(),
    reason               text NOT NULL
                         CHECK (reason IN ('policy_overdue','manual','ai_detected')),
    resolved_at          timestamptz,
    resolved_by          uuid,
    created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS freshness_flag_resource_idx ON freshness_flag (resource_type, resource_id);
CREATE INDEX IF NOT EXISTS freshness_flag_resolved_idx ON freshness_flag (resolved_at)
    WHERE resolved_at IS NULL;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'expiry_policy',
        'freshness_flag'
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
