-- 0053_phase15_display_profile.up.sql
-- Phase 15 W14: Display profiles for 1080p / 1440p / 4K / 8K / user-defined
-- up to 16K-wide. sRGB / Display P3 / Rec.2020 + HDR. Dual-screen mirroring
-- modes (clone / extend / audience-only).
--
-- Tables:
--   display_profile — catalog of profile presets selectable at session start
--                     or re-evaluable mid-session.
--   display_assignment — per-session active profile + mirror mode + bandwidth
--                        estimate.

BEGIN;

CREATE TABLE IF NOT EXISTS display_profile (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id           uuid NOT NULL,
    name                   text NOT NULL,
    width                  integer NOT NULL CHECK (width BETWEEN 320 AND 16384),
    height                 integer NOT NULL CHECK (height BETWEEN 240 AND 8192),
    refresh_hz             numeric(6,2) NOT NULL DEFAULT 60.00
                           CHECK (refresh_hz BETWEEN 24.00 AND 480.00),
    color_profile          text NOT NULL DEFAULT 'srgb'
                           CHECK (color_profile IN ('srgb','display_p3','rec2020')),
    hdr                    boolean NOT NULL DEFAULT false,
    bandwidth_estimate_mbps numeric(8,2) NOT NULL DEFAULT 50.0,
    builtin                boolean NOT NULL DEFAULT false,
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now(),
    created_by             uuid,
    updated_by             uuid,
    ai_run_id              uuid,
    agent_session_id       uuid,
    UNIQUE (workspace_id, name)
);

CREATE INDEX IF NOT EXISTS display_profile_workspace_idx
    ON display_profile (workspace_id);

CREATE TABLE IF NOT EXISTS display_assignment (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id          uuid NOT NULL,
    presenter_session_id  uuid NOT NULL REFERENCES presenter_session (id) ON DELETE CASCADE,
    display_profile_id    uuid NOT NULL REFERENCES display_profile (id) ON DELETE RESTRICT,
    mirror_mode           text NOT NULL DEFAULT 'extend'
                          CHECK (mirror_mode IN ('clone','extend','audience_only')),
    bandwidth_warning     boolean NOT NULL DEFAULT false,
    bandwidth_warning_msg text,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid,
    updated_by            uuid,
    ai_run_id             uuid,
    agent_session_id      uuid,
    UNIQUE (presenter_session_id)
);

CREATE INDEX IF NOT EXISTS display_assignment_workspace_idx
    ON display_assignment (workspace_id);

DO $$
DECLARE
    t text;
    tables text[] := ARRAY['display_profile', 'display_assignment'];
BEGIN
    FOREACH t IN ARRAY tables LOOP
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

-- ---------------------------------------------------------------------------
-- Seed built-in profiles. These are common across all workspaces.
-- ---------------------------------------------------------------------------
INSERT INTO display_profile (workspace_id, name, width, height, refresh_hz, color_profile, hdr, bandwidth_estimate_mbps, builtin)
SELECT w.id, p.name, p.width, p.height, p.refresh_hz, p.color_profile, p.hdr, p.bandwidth_estimate_mbps, true
FROM (VALUES
    ('1080p',            1920, 1080,  60.0, 'srgb',      false,  50.0),
    ('1440p',            2560, 1440,  60.0, 'srgb',      false,  80.0),
    ('4K',               3840, 2160,  60.0, 'srgb',      false, 150.0),
    ('4K-HDR',           3840, 2160,  60.0, 'rec2020',   true,  220.0),
    ('8K',               7680, 4320,  60.0, 'srgb',      false, 480.0),
    ('8K-HDR',           7680, 4320,  60.0, 'rec2020',   true,  640.0),
    ('LED-16K-Wide',    15360, 4320,  60.0, 'rec2020',   true, 1200.0)
) AS p(name, width, height, refresh_hz, color_profile, hdr, bandwidth_estimate_mbps)
CROSS JOIN (SELECT id FROM workspaces) AS w
ON CONFLICT (workspace_id, name) DO NOTHING;

COMMIT;