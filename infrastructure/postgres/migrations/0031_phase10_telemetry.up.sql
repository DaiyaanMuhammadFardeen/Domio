-- 0031_phase10_telemetry.up.sql
-- Phase 10 M5 — Prototype User-Testing Telemetry.
-- Adds prototype_sessions, prototype_events, and integrity_chain.
--
-- prototype_events is an append-only ledger; integrity_chain is the
-- HMAC key ledger (one row per (tenant_id, deck_id, kid)). Both
-- participate in tenant-isolation RLS.

BEGIN;

-- prototype_sessions — one row per test-runner session.
CREATE TABLE IF NOT EXISTS prototype_sessions (
    id              text PRIMARY KEY,
    tenant_id       text NOT NULL,
    deck_id         text NOT NULL,
    subject_id      text,
    session_token   text NOT NULL,
    consent         text NOT NULL CHECK (consent IN ('opt_in','opt_out','anonymous')),
    region          text NOT NULL CHECK (region IN ('us-east','us-west','eu-central','ap-south','ap-east')),
    region_pinned   boolean NOT NULL DEFAULT false,
    ab_variant      text,
    sampling_rate   numeric NOT NULL DEFAULT 1.0,
    kid             text NOT NULL,
    started_at      timestamptz NOT NULL DEFAULT now(),
    last_event_at   timestamptz NOT NULL DEFAULT now(),
    expires_at      timestamptz NOT NULL,
    last_seq        integer NOT NULL DEFAULT 0,
    UNIQUE (tenant_id, session_token)
);

CREATE INDEX IF NOT EXISTS prototype_sessions_tenant_deck_idx ON prototype_sessions (tenant_id, deck_id);
CREATE INDEX IF NOT EXISTS prototype_sessions_subject_idx      ON prototype_sessions (tenant_id, subject_id);
CREATE INDEX IF NOT EXISTS prototype_sessions_expires_idx     ON prototype_sessions (expires_at);

-- prototype_events — append-only ledger.
CREATE TABLE IF NOT EXISTS prototype_events (
    id                  text PRIMARY KEY,
    tenant_id           text NOT NULL,
    deck_id             text NOT NULL,
    session_id          text NOT NULL,
    seq                 integer NOT NULL,
    event_type          text NOT NULL,
    payload             jsonb NOT NULL,
    prev_hash           text NOT NULL,
    event_hash          text NOT NULL,
    kid                 text NOT NULL,
    client_fingerprint  text NOT NULL,
    region              text NOT NULL CHECK (region IN ('us-east','us-west','eu-central','ap-south','ap-east')),
    created_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (session_id, seq)
);

CREATE INDEX IF NOT EXISTS prototype_events_session_seq_idx    ON prototype_events (session_id, seq);
CREATE INDEX IF NOT EXISTS prototype_events_tenant_created_idx  ON prototype_events (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS prototype_events_deck_type_idx       ON prototype_events (deck_id, event_type);
CREATE INDEX IF NOT EXISTS prototype_events_payload_gin_idx     ON prototype_events USING gin (payload);

-- integrity_chain — append-only ledger of HMAC keys per (tenant, deck, kid).
CREATE TABLE IF NOT EXISTS integrity_chain (
    id              text PRIMARY KEY,
    tenant_id       text NOT NULL,
    deck_id         text NOT NULL,
    kid             text NOT NULL,
    key_hex         text NOT NULL,
    rotated_at      timestamptz NOT NULL DEFAULT now(),
    expires_at      timestamptz NOT NULL,
    overlap_until   timestamptz NOT NULL,
    UNIQUE (tenant_id, deck_id, kid)
);

CREATE INDEX IF NOT EXISTS integrity_chain_tenant_deck_idx ON integrity_chain (tenant_id, deck_id);
CREATE INDEX IF NOT EXISTS integrity_chain_active_idx      ON integrity_chain (tenant_id, deck_id, overlap_until DESC);

-- RLS: enable + tenant_isolation policy on every M5 table.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['prototype_sessions','prototype_events','integrity_chain']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (
         tenant_id = current_setting(''app.tenant_id'', true)
         OR current_setting(''app.bypass_rls'', true) = ''on''
       ) WITH CHECK (
         tenant_id = current_setting(''app.tenant_id'', true)
         OR current_setting(''app.bypass_rls'', true) = ''on''
       )',
      t || '_tenant_isolation', t);
  END LOOP;
END $$;

COMMIT;
