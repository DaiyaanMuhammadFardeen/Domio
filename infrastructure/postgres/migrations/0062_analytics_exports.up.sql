-- 0062_analytics_exports.up.sql
-- Phase 17 W11: Bulk export + audit.
--
-- analytics_export_run  — workspace-level export job (CSV / Parquet
--                         / NDJSON) of a deck or session. Streams
--                         from ClickHouse through the warehouse.
-- analytics_export_audit — append-only audit of who ran which export
--                          when, used for compliance + GDPR.
-- engagement_score_event — append-only stream of computed
--                          engagement-score events per viewer
--                          (consumed by the notification dispatcher
--                          in W8).
--
-- The trigger on analytics_export_run records an audit row on every
-- state transition so we have a complete trail even if downstream
-- actions fail.

BEGIN;

CREATE TABLE IF NOT EXISTS analytics_export_run (
    run_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id        UUID NOT NULL,
    requested_by        UUID NOT NULL,
    -- 'deck' | 'session' | 'viewer'
    scope_kind          TEXT NOT NULL CHECK (scope_kind IN ('deck','session','viewer')),
    scope_id            TEXT NOT NULL,
    -- 'csv' | 'parquet' | 'ndjson'
    format              TEXT NOT NULL CHECK (format IN ('csv','parquet','ndjson')),
    from_ms             BIGINT NOT NULL,
    to_ms               BIGINT NOT NULL,
    -- 'queued' | 'running' | 'done' | 'failed'
    state               TEXT NOT NULL DEFAULT 'queued'
        CHECK (state IN ('queued','running','done','failed')),
    object_key          TEXT,
    size_bytes          BIGINT,
    row_count           BIGINT,
    error_message       TEXT,
    requested_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS analytics_export_run_workspace_idx
    ON analytics_export_run (workspace_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS analytics_export_run_state_idx
    ON analytics_export_run (state) WHERE state IN ('queued','running');

CREATE TABLE IF NOT EXISTS analytics_export_audit (
    audit_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id        UUID NOT NULL,
    run_id              UUID NOT NULL REFERENCES analytics_export_run(run_id) ON DELETE CASCADE,
    actor_id            UUID NOT NULL,
    -- 'requested' | 'started' | 'completed' | 'failed' | 'downloaded'
    event_kind          TEXT NOT NULL
        CHECK (event_kind IN ('requested','started','completed','failed','downloaded')),
    occurred_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata_json       JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS analytics_export_audit_run_idx
    ON analytics_export_audit (run_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS engagement_score_event (
    event_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id        UUID NOT NULL,
    viewer_id_key       TEXT NOT NULL,
    session_id_key      TEXT,
    deck_id             UUID,
    -- Snapshot component scores in [0, 100].
    score_engagement    REAL NOT NULL,
    score_attention     REAL NOT NULL,
    score_completion    REAL NOT NULL,
    score_overall       REAL NOT NULL,
    -- 'ml' | 'heuristic'
    model_version       TEXT NOT NULL DEFAULT 'heuristic-v1',
    occurred_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS engagement_score_event_workspace_ts_idx
    ON engagement_score_event (workspace_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS engagement_score_event_viewer_idx
    ON engagement_score_event (viewer_id_key, occurred_at DESC);

-- ---------------------------------------------------------------------------
-- Triggers — audit row on every state transition of an export run.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION analytics_export_run_audit_trigger()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO analytics_export_audit (
        workspace_id, run_id, actor_id, event_kind, metadata_json
    )
    VALUES (
        NEW.workspace_id,
        NEW.run_id,
        COALESCE(NEW.requested_by, '00000000-0000-0000-0000-000000000000'::uuid),
        CASE
            WHEN TG_OP = 'INSERT' THEN 'requested'
            WHEN NEW.state = 'running' AND OLD.state <> 'running' THEN 'started'
            WHEN NEW.state = 'done'    AND OLD.state <> 'done'    THEN 'completed'
            WHEN NEW.state = 'failed'  AND OLD.state <> 'failed'  THEN 'failed'
            ELSE NULL
        END,
        jsonb_build_object(
            'format', NEW.format,
            'scope_kind', NEW.scope_kind,
            'scope_id', NEW.scope_id
        )
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS analytics_export_run_audit ON analytics_export_run;
CREATE TRIGGER analytics_export_run_audit
AFTER INSERT OR UPDATE OF state ON analytics_export_run
FOR EACH ROW
EXECUTE FUNCTION analytics_export_run_audit_trigger();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'analytics_export_run',
        'analytics_export_audit',
        'engagement_score_event'
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
