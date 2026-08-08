-- 0081_phase19_payments.up.sql
-- Phase 19 WS-MKT-4: Payment intent + subscription lifecycle.
--
-- Tables:
--   payment_intent — one purchase transaction (Stripe/bKash/Nagad).
--   subscription   — recurring subscription to a marketplace listing.
--
-- RLS: workspace-scoped (tenant isolation via workspace_id).
-- ---------------------------------------------------------------------------

BEGIN;

-- ---------------------------------------------------------------------------
-- payment_intent — immutable record of a purchase transaction.
-- buyer_id: the purchasing user (text, consistent with P06 seller_id).
-- listing_id: FK to P06 marketplace_listing(id).
-- purchase_id: application-level purchase identifier for idempotent delivery.
-- provider: stripe | bkash | nagad.
-- idempotency_key: UNIQUE per workspace; prevents duplicate charges.
-- All monetary amounts are bigint cents (no floats).
-- fx_rate / fx_timestamp: locked at invoice time for cross-border compliance.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payment_intent (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id        uuid NOT NULL,
    buyer_id            text NOT NULL,
    listing_id          uuid NOT NULL REFERENCES marketplace_listing (id) ON DELETE CASCADE,
    purchase_id         uuid NOT NULL,
    provider            text NOT NULL
                        CHECK (provider IN ('stripe', 'bkash', 'nagad')),
    provider_intent_id  text,
    currency            char(3) NOT NULL,
    gross_cents         bigint NOT NULL,
    tax_cents           bigint NOT NULL DEFAULT 0,
    fee_cents           bigint NOT NULL DEFAULT 0,
    net_cents           bigint NOT NULL,
    fx_rate             numeric(18, 8),
    fx_timestamp        timestamptz,
    status              text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded', 'disputed')),
    idempotency_key     text NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS payment_intent_buyer_listing_idx
    ON payment_intent (buyer_id, listing_id);
CREATE INDEX IF NOT EXISTS payment_intent_idempotency_idx
    ON payment_intent (idempotency_key);

-- ---------------------------------------------------------------------------
-- subscription — recurring subscription to a marketplace listing.
-- provider_subscription_id: Stripe subscription ID or equivalent.
-- status: active | past_due | canceled | incomplete.
-- current_period_end: when the current billing period ends.
-- cancel_at_period_end: if true, subscription cancels at period end.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscription (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id                uuid NOT NULL,
    listing_id                  uuid NOT NULL REFERENCES marketplace_listing (id) ON DELETE CASCADE,
    buyer_id                    text NOT NULL,
    provider_subscription_id    text,
    status                      text NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active', 'past_due', 'canceled', 'incomplete')),
    current_period_end          timestamptz,
    cancel_at_period_end        boolean NOT NULL DEFAULT false,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscription_listing_buyer_idx
    ON subscription (listing_id, buyer_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'payment_intent',
        'subscription'
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
