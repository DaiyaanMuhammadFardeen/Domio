-- 0079_phase19_creator.up.sql
-- Phase 19 WS-MKT-6: Creator onboarding, KYC, and payout method.
--
-- Tables:
--   creator_profile         — user-scoped creator identity + balance.
--   creator_payout_method   — user-scoped payout instruments (Stripe, bKash, etc.).
--   kyc_session             — user-scoped KYC verification sessions.
--
-- RLS DECISION: These three tables are USER-scoped, not workspace-scoped.
-- creator_profile is keyed by user_id (a user may sell across workspaces).
-- No workspace_id column is present. RLS is intentionally omitted; access
-- control is enforced at the application layer (service checks user identity).
-- ---------------------------------------------------------------------------

BEGIN;

-- ---------------------------------------------------------------------------
-- creator_profile — creator identity, KYC state, and running balance.
-- user_id: the platform user who owns this profile (immutable at creation).
-- kyc_status: pending | approved | rejected | expired (CHECK enforced).
-- balance_cents: accumulated unpaid balance in integer cents (bigint for
--   overflow safety at scale). Updated by payout executor on payout.
-- currency: ISO 4217 code for the creator's preferred payout currency.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS creator_profile (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         text NOT NULL UNIQUE,
    display_name    text NOT NULL,
    slug            text NOT NULL UNIQUE,
    bio             text NOT NULL DEFAULT '',
    country_code    char(2),
    payout_method   text NOT NULL DEFAULT 'stripe_connect'
                    CHECK (payout_method IN ('stripe_connect', 'bkash', 'nagad', 'bank')),
    payout_ready    boolean NOT NULL DEFAULT false,
    kyc_status      text NOT NULL DEFAULT 'pending'
                    CHECK (kyc_status IN ('pending', 'approved', 'rejected', 'expired')),
    balance_cents   bigint NOT NULL DEFAULT 0,
    currency        char(3) NOT NULL DEFAULT 'USD',
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS creator_profile_user_id_idx ON creator_profile (user_id);

-- ---------------------------------------------------------------------------
-- creator_payout_method — payout instrument绑定到一个 creator_profile。
-- kind: stripe_connect | bkash | nagad | bank.
-- verified: set to true after the provider confirms the account.
-- metadata: provider-specific details (Stripe account ID, bKash mobile, etc.)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS creator_payout_method (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id          uuid NOT NULL REFERENCES creator_profile (id) ON DELETE CASCADE,
    kind                text NOT NULL
                        CHECK (kind IN ('stripe_connect', 'bkash', 'nagad', 'bank')),
    external_account_id text,
    verified            boolean NOT NULL DEFAULT false,
    metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS creator_payout_method_creator_idx ON creator_payout_method (creator_id);

-- ---------------------------------------------------------------------------
-- kyc_session — KYC verification session with a vendor (Persona, Sumsub, etc.)
-- vendor: the KYC provider name (vendor-agnostic).
-- status: started | pending | approved | rejected | expired.
-- last_polled_at: last time the worker polled the vendor for status updates.
-- raw: full vendor response for audit/debug.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kyc_session (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id          uuid NOT NULL REFERENCES creator_profile (id) ON DELETE CASCADE,
    vendor              text NOT NULL,
    vendor_session_id   text,
    status              text NOT NULL DEFAULT 'started'
                        CHECK (status IN ('started', 'pending', 'approved', 'rejected', 'expired')),
    last_polled_at      timestamptz,
    raw                 jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kyc_session_creator_idx ON kyc_session (creator_id);

-- NOTE: No RLS on these tables. They are user-scoped (not workspace-scoped).
-- Access control is enforced at the application/service layer.

COMMIT;
