-- 0082_phase19_payout.up.sql
-- Phase 19 WS-MKT-7: Payout execution and ledger.
--
-- Tables:
--   payout_ledger_entry — per-event payout record, one row per
--     revenue_share_event that has been paid/held/failed.
--   payout_run — one execution batch of the monthly payout executor.
--
-- RLS: workspace-scoped (tenant isolation via workspace_id).
-- ---------------------------------------------------------------------------

BEGIN;

-- ---------------------------------------------------------------------------
-- payout_ledger_entry — per-event payout line item.
-- creator_id: references creator_profile(id) (user-scoped FK, no workspace FK).
-- event_id: FK to P06 revenue_share_event(id) — the source revenue event.
-- period_month: 'YYYY-MM' human-readable period key.
-- status: pending | paid | held | failed | refunded.
-- executor_run_id: links to payout_run(id) for the batch that paid this.
-- UNIQUE(executor_run_id, event_id): idempotency — prevents double-payout.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payout_ledger_entry (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id            uuid NOT NULL,
    creator_id              uuid NOT NULL REFERENCES creator_profile (id) ON DELETE CASCADE,
    period_month            text NOT NULL,
    event_id                uuid NOT NULL REFERENCES revenue_share_event (id) ON DELETE CASCADE,
    gross_cents             bigint NOT NULL,
    fee_cents               bigint NOT NULL DEFAULT 0,
    net_cents               bigint NOT NULL,
    currency                char(3) NOT NULL,
    status                  text NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'paid', 'held', 'failed', 'refunded')),
    provider                text,
    provider_transfer_id    text,
    executor_run_id         uuid,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    UNIQUE (executor_run_id, event_id)
);

CREATE INDEX IF NOT EXISTS payout_ledger_entry_creator_period_idx
    ON payout_ledger_entry (creator_id, period_month);

-- ---------------------------------------------------------------------------
-- payout_run — one batch execution of the monthly payout executor.
-- period_month: 'YYYY-MM' human-readable period key.
-- total_creators: count of creators paid in this run.
-- total_payout_cents: sum of all net_cents paid in this run.
-- status: running | completed | partial_failure.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payout_run (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id        uuid NOT NULL,
    period_month        text NOT NULL,
    executed_at         timestamptz NOT NULL DEFAULT now(),
    total_creators      integer NOT NULL DEFAULT 0,
    total_payout_cents  bigint NOT NULL DEFAULT 0,
    currency            char(3) NOT NULL DEFAULT 'USD',
    status              text NOT NULL DEFAULT 'running'
                        CHECK (status IN ('running', 'completed', 'partial_failure')),
    created_at          timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'payout_ledger_entry',
        'payout_run'
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
