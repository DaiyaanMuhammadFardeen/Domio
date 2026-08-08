-- 0052_phase15_offline_cache.up.sql
-- Phase 15 W13: Offline presenting mode. Cache is managed by a service
-- worker that stores an encrypted blob per (deck, presenter) — sealed in
-- the OS keystore via AES-GCM. Cache invalidates on presenter logout.
--
-- Tables:
--   offline_cache_entry — composite PK (deck_id, presenter_id). Stores the
--                         encryption metadata + storage handle (S3 key).

BEGIN;

CREATE TABLE IF NOT EXISTS offline_cache_entry (
    deck_id             uuid NOT NULL,
    presenter_id        uuid NOT NULL,
    workspace_id        uuid NOT NULL,
    storage_handle      text NOT NULL,
    encrypted_blob_key  text,
    encryption_alg       text NOT NULL DEFAULT 'AES-256-GCM'
                         CHECK (encryption_alg IN ('AES-256-GCM','AES-128-GCM')),
    snapshot_at         timestamptz NOT NULL DEFAULT now(),
    schema_version      integer NOT NULL DEFAULT 1,
    size_bytes          bigint NOT NULL DEFAULT 0,
    invalidated         boolean NOT NULL DEFAULT false,
    invalidated_at      timestamptz,
    invalidated_reason  text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    ai_run_id           uuid,
    agent_session_id    uuid,
    PRIMARY KEY (deck_id, presenter_id)
);

CREATE INDEX IF NOT EXISTS offline_cache_workspace_idx
    ON offline_cache_entry (workspace_id);
CREATE INDEX IF NOT EXISTS offline_cache_snapshot_idx
    ON offline_cache_entry (snapshot_at DESC);

DO $$
DECLARE
    t text := 'offline_cache_entry';
BEGIN
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
END $$;

COMMIT;