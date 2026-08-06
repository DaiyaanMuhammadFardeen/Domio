-- 0041_phase14_sharing.up.sql
-- Phase 14 W1: Share-link data plane.
--
-- Tables:
--   share_link              — one shareable link to a deck.
--   link_policy             — visibility + expiry + allowed viewers for a share link.
--   link_visibility_rule    — per-row visibility override (e.g. "this slide hidden").
--   watermark_profile       — W3 watermark preset attached to a share link.
--   embed_config            — W5/W6 embed iframe config attached to a share link.
--   seo_metadata            — W9 SEO / Open Graph metadata attached to a share link.
--
-- All tables follow the P12 universal audit quartet:
--   created_at, updated_at, created_by, updated_by, ai_run_id, agent_session_id.
--
-- Workspace isolation: workspace_id UUID NOT NULL with RLS policies,
-- matching the 0039/0040 pattern.
--
-- The watermark_profile / embed_config / seo_metadata tables are CREATED here
-- even though W1 does not read or write them — they exist so W3/W4/W5/W9 do
-- not need another migration. They carry only the structural columns needed
-- for FK attachment.

BEGIN;

-- ---------------------------------------------------------------------------
-- share_link — one shareable link to a deck.
-- short_id   : 8-char Crockford base32 identifier (public, embeddable in URLs).
-- slug       : optional human-readable slug (e.g. "q3-board-update").
-- token_hash : SHA-256 of the currently-active signed link token. Rotated on
--              every POST /v1/shares/{id}/rotate-token. NULL only briefly
--              during creation, before mint.
-- status     : 'active' | 'revoked' | 'expired'.
-- revoked_at : non-NULL after DELETE /v1/shares/{id} (soft delete).
-- expires_at : non-NULL means the link auto-expires; NULL = never expires.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS share_link (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id      uuid NOT NULL,
    deck_id           uuid NOT NULL,
    short_id          text NOT NULL,
    slug              text,
    token_hash        text,
    status            text NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','revoked','expired')),
    expires_at        timestamptz,
    revoked_at        timestamptz,
    revoked_by        uuid,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    created_by        uuid,
    updated_by        uuid,
    ai_run_id         uuid,
    agent_session_id  uuid,
    UNIQUE (workspace_id, short_id),
    UNIQUE (workspace_id, slug)
);

CREATE INDEX IF NOT EXISTS share_link_workspace_idx       ON share_link (workspace_id);
CREATE INDEX IF NOT EXISTS share_link_deck_idx            ON share_link (deck_id);
CREATE INDEX IF NOT EXISTS share_link_token_idx           ON share_link (token_hash);
CREATE INDEX IF NOT EXISTS share_link_status_idx          ON share_link (workspace_id, status);

-- ---------------------------------------------------------------------------
-- link_policy — visibility + allowed viewers + share-window config.
-- One-to-one with share_link (one policy per link in W1).
-- visibility : 'public' | 'link_only' | 'allowlist' | 'domain_restricted'.
-- allowed_viewers : JSON array of { type, value } tuples (e.g. email,
--                   domain, group_id). Only consulted when
--                   visibility = 'allowlist' or 'domain_restricted'.
-- max_views / view_count : optional view-cap. NULL disables the cap.
-- allow_download, allow_print, allow_embed : boolean toggles.
-- require_passcode : when true, the link requires a passcode (W2 evaluates).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS link_policy (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id          uuid NOT NULL,
    share_link_id         uuid NOT NULL UNIQUE REFERENCES share_link (id) ON DELETE CASCADE,
    visibility            text NOT NULL DEFAULT 'link_only'
                          CHECK (visibility IN ('public','link_only','allowlist','domain_restricted')),
    allowed_viewers       jsonb NOT NULL DEFAULT '[]'::jsonb,
    max_views             integer,
    view_count            integer NOT NULL DEFAULT 0,
    allow_download        boolean NOT NULL DEFAULT false,
    allow_print           boolean NOT NULL DEFAULT false,
    allow_embed           boolean NOT NULL DEFAULT true,
    require_passcode      boolean NOT NULL DEFAULT false,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid,
    updated_by            uuid,
    ai_run_id             uuid,
    agent_session_id      uuid
);

CREATE INDEX IF NOT EXISTS link_policy_workspace_idx ON link_policy (workspace_id);

-- ---------------------------------------------------------------------------
-- link_visibility_rule — per-row visibility override (slide-level).
-- W2 evaluates these. W1 stores the rows so the API surface is complete.
-- rule_type : 'hide_slide' | 'show_slide' | 'redact_text'.
-- target    : slide_id or text-pattern the rule applies to.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS link_visibility_rule (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id      uuid NOT NULL,
    share_link_id     uuid NOT NULL REFERENCES share_link (id) ON DELETE CASCADE,
    rule_type         text NOT NULL
                      CHECK (rule_type IN ('hide_slide','show_slide','redact_text')),
    target            text NOT NULL,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    created_by        uuid,
    updated_by        uuid,
    ai_run_id         uuid,
    agent_session_id  uuid
);

CREATE INDEX IF NOT EXISTS link_visibility_rule_link_idx
    ON link_visibility_rule (share_link_id);

-- ---------------------------------------------------------------------------
-- watermark_profile — W3 watermark preset (text + opacity + position).
-- Created here so W3 does not need another migration. W1 does not write to
-- or read from this table; FK attachment is optional (NULL on share_link).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS watermark_profile (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id      uuid NOT NULL,
    name              text NOT NULL,
    text_template     text NOT NULL,
    opacity           numeric(4,3) NOT NULL DEFAULT 0.15
                      CHECK (opacity >= 0 AND opacity <= 1),
    position          text NOT NULL DEFAULT 'bottom_right'
                      CHECK (position IN ('top_left','top_right','bottom_left','bottom_right','tiled')),
    enabled           boolean NOT NULL DEFAULT true,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    created_by        uuid,
    updated_by        uuid,
    ai_run_id         uuid,
    agent_session_id  uuid,
    UNIQUE (workspace_id, name)
);

CREATE INDEX IF NOT EXISTS watermark_profile_workspace_idx
    ON watermark_profile (workspace_id);

-- Optional FK: share_link.watermark_profile_id NULL in W1.
ALTER TABLE share_link
    ADD COLUMN IF NOT EXISTS watermark_profile_id uuid
        REFERENCES watermark_profile (id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- embed_config — W5/W6 embed iframe config (allowed origins, sandbox flags).
-- Created here so W5 does not need another migration.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS embed_config (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id      uuid NOT NULL,
    share_link_id     uuid NOT NULL UNIQUE REFERENCES share_link (id) ON DELETE CASCADE,
    allowed_origins   jsonb NOT NULL DEFAULT '[]'::jsonb,
    sandbox_flags     text NOT NULL DEFAULT 'allow-scripts allow-same-origin allow-forms',
    trap_focus        boolean NOT NULL DEFAULT false,
    jwt_required      boolean NOT NULL DEFAULT true,
    jwt_audience      text,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    created_by        uuid,
    updated_by        uuid,
    ai_run_id         uuid,
    agent_session_id  uuid
);

CREATE INDEX IF NOT EXISTS embed_config_workspace_idx ON embed_config (workspace_id);

-- ---------------------------------------------------------------------------
-- seo_metadata — W9 SEO / Open Graph metadata for a share link.
-- Created here so W9 does not need another migration.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS seo_metadata (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id      uuid NOT NULL,
    share_link_id     uuid NOT NULL UNIQUE REFERENCES share_link (id) ON DELETE CASCADE,
    title             text,
    description       text,
    og_image_url      text,
    twitter_card      text
                      CHECK (twitter_card IS NULL OR twitter_card IN ('summary','summary_large_image','app','player')),
    canonical_url     text,
    robots            text NOT NULL DEFAULT 'index,follow',
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    created_by        uuid,
    updated_by        uuid,
    ai_run_id         uuid,
    agent_session_id  uuid
);

CREATE INDEX IF NOT EXISTS seo_metadata_workspace_idx ON seo_metadata (workspace_id);

-- ---------------------------------------------------------------------------
-- Row-level security. Same pattern as 0039/0040.
-- All six tables carry workspace_id and get the same tenant_isolation policy.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    t text;
    tables text[] := ARRAY[
        'share_link',
        'link_policy',
        'link_visibility_rule',
        'watermark_profile',
        'embed_config',
        'seo_metadata'
    ];
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

COMMIT;
