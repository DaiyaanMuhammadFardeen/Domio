-- 0049_phase15_pip.up.sql
-- Phase 15 W10: Picture-in-picture presenter camera bubble with virtual
-- background. WebGL2 self-segmentation ≥30 FPS on a mid-tier laptop. Raw
-- frames never leave the device; only the processed bubble crosses the
-- network when explicitly shared.
--
-- Tables:
--   pip_config — one row per session. position ('corner'|'banner'|'hidden'),
--                shape ('rect'|'circle'|'rounded'), virtual_background
--                ('none'|'blur'|'image'|'video').

BEGIN;

CREATE TABLE IF NOT EXISTS pip_config (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id          uuid NOT NULL,
    presenter_session_id  uuid NOT NULL UNIQUE REFERENCES presenter_session (id) ON DELETE CASCADE,
    position              text NOT NULL DEFAULT 'corner'
                          CHECK (position IN ('corner','banner','hidden')),
    shape                 text NOT NULL DEFAULT 'rect'
                          CHECK (shape IN ('rect','circle','rounded')),
    width_px              integer NOT NULL DEFAULT 320
                          CHECK (width_px BETWEEN 80 AND 1920),
    height_px             integer NOT NULL DEFAULT 240
                          CHECK (height_px BETWEEN 60 AND 1080),
    virtual_background    text NOT NULL DEFAULT 'none'
                          CHECK (virtual_background IN ('none','blur','image','video')),
    virtual_background_asset_id uuid,
    border_color          text,
    shadow                boolean NOT NULL DEFAULT true,
    consent_id            uuid,
    consent_at            timestamptz,
    consent_revoked_at    timestamptz,
    segmentation_model    text NOT NULL DEFAULT 'mediapipe_selfie'
                          CHECK (segmentation_model IN ('mediapipe_selfie','webgl2_threshold')),
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid,
    updated_by            uuid,
    ai_run_id             uuid,
    agent_session_id      uuid
);

CREATE INDEX IF NOT EXISTS pip_config_workspace_idx
    ON pip_config (workspace_id);

DO $$
DECLARE
    t text := 'pip_config';
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