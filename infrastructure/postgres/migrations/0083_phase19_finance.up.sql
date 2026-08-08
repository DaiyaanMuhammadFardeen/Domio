-- 0083_phase19_finance.up.sql
-- Phase 19 WS-MKT-7: FX rates + tax records.
--
-- Tables:
--   fx_rate     — daily cached FX mid-rates (global, no workspace isolation).
--   tax_record  — per-payment tax computation record (workspace-scoped).
--
-- RLS DECISION:
--   fx_rate: GLOBAL table. No workspace_id. FX rates are shared across all
--     tenants. RLS omitted; reads go through bypass_rls or are public.
--   tax_record: workspace-scoped. References payment_intent which carries
--     workspace_id. RLS enabled for tenant isolation.
-- ---------------------------------------------------------------------------

BEGIN;

-- ---------------------------------------------------------------------------
-- fx_rate — cached exchange rate snapshot.
-- base: ISO 4217 base currency code (e.g. 'USD').
-- quote: ISO 4217 quote currency code (e.g. 'BDT').
-- rate: the mid-market rate (numeric for precision).
-- fetched_at: when the rate was fetched from the provider.
-- source: provider identifier (e.g. 'openexchangerates').
-- UNIQUE(base, quote, fetched_at): one rate per pair per fetch window.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fx_rate (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    base        char(3) NOT NULL,
    quote       char(3) NOT NULL,
    rate        numeric(18, 8) NOT NULL,
    fetched_at  timestamptz NOT NULL DEFAULT now(),
    source      text NOT NULL,
    UNIQUE (base, quote, fetched_at)
);

-- No RLS on fx_rate: global shared data, not tenant-scoped.

-- ---------------------------------------------------------------------------
-- tax_record — per-payment tax computation.
-- payment_intent_id: FK to payment_intent(id) — the taxed transaction.
-- country_code: ISO 3166-1 alpha-2 country where tax is levied.
-- tax_type: e.g. 'vat', 'gst', 'sales_tax'.
-- rate: the tax rate applied (numeric, e.g. 0.15 for 15%).
-- tax_cents: integer cents of tax computed.
-- currency: ISO 4217 code for the tax amount.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tax_record (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id        uuid NOT NULL,
    payment_intent_id   uuid NOT NULL REFERENCES payment_intent (id) ON DELETE CASCADE,
    country_code        char(2) NOT NULL,
    tax_type            text NOT NULL,
    rate                numeric(8, 6) NOT NULL,
    tax_cents           bigint NOT NULL,
    currency            char(3) NOT NULL,
    computed_at         timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- RLS — workspace-scoped (tax records follow payment_intent tenant isolation).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'tax_record'
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
