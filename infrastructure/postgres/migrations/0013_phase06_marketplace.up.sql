-- Migration 0013: Phase 06 — marketplace plumbing (without payout execution).
--
-- marketplace_listing lifecycle: draft -> in_review -> published -> deprecated
-- -> removed. license_grant stores the signed JWT; revenue_share_event is the
-- append-only ledger keyed by seller/period/payout_status. Payout execution is
-- P19: this phase only ever writes payout_status in (pending, eligible).

BEGIN;

CREATE TABLE IF NOT EXISTS marketplace_listing (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    catalog_id      text NOT NULL,
    seller_id       text NOT NULL,
    title           text NOT NULL,
    description     text NOT NULL DEFAULT '',
    status          text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'in_review', 'published', 'deprecated', 'removed')),
    is_free         boolean NOT NULL DEFAULT true,
    price_cents     integer,
    currency        text,
    tags            jsonb NOT NULL DEFAULT '[]'::jsonb,
    preview         jsonb,
    published_at_ms bigint,
    deprecated_at_ms bigint,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketplace_listing_status_idx
    ON marketplace_listing (status, created_at DESC);

CREATE TABLE IF NOT EXISTS marketplace_review (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id      uuid NOT NULL REFERENCES marketplace_listing (id) ON DELETE CASCADE,
    reviewer_id     text NOT NULL,
    rating          integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
    body            text NOT NULL DEFAULT '',
    status          text NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued', 'accepted', 'auto_flagged', 'removed')),
    verified_buyer  boolean NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS license_grant (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    text NOT NULL,
    user_id         text,
    catalog_id      text NOT NULL,
    version         text NOT NULL,
    listing_id      uuid,
    license_id      text NOT NULL,
    seats           integer NOT NULL DEFAULT 1,
    signed_token    text NOT NULL,
    issued_at_ms    bigint NOT NULL,
    expires_at_ms   bigint NOT NULL,
    revoked_at_ms   bigint,
    offline_grace_until_ms bigint,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS license_grant_workspace_catalog_idx
    ON license_grant (workspace_id, catalog_id, version);

CREATE TABLE IF NOT EXISTS revenue_share_event (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id      uuid NOT NULL REFERENCES marketplace_listing (id) ON DELETE CASCADE,
    seller_id       text NOT NULL,
    workspace_id    text NOT NULL,
    currency        text NOT NULL,
    gross_cents     integer NOT NULL,
    fee_cents       integer NOT NULL,
    net_cents       integer NOT NULL,
    payout_status   text NOT NULL DEFAULT 'pending'
                    CHECK (payout_status IN ('pending', 'eligible', 'refunded')),
    period_month    text NOT NULL,
    event_type      text NOT NULL DEFAULT 'install',
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS revenue_share_seller_period_idx
    ON revenue_share_event (seller_id, period_month, payout_status);

ALTER TABLE marketplace_listing ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_review   ENABLE ROW LEVEL SECURITY;
ALTER TABLE license_grant        ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_share_event  ENABLE ROW LEVEL SECURITY;

COMMIT;
