-- 0036_phase11_media_assets.up.sql
-- Phase 11: media asset tables — video_asset, audio_track, lottie_asset,
-- ar_session. Tenant isolation via current_setting('app.tenant_id'),
-- matching 0003/0023/0032.

BEGIN;

-- VideoAsset: uploaded video with transcoding state and CDN URLs.
CREATE TABLE IF NOT EXISTS video_asset (
    id              text PRIMARY KEY,
    tenant_id       text NOT NULL,
    uploader_id     text NOT NULL,
    name            text NOT NULL,
    source_url      text NOT NULL,
    hls_url         text,
    dash_url        text,
    duration_ms     integer NOT NULL,
    width           integer NOT NULL,
    height          integer NOT NULL,
    has_audio       boolean NOT NULL,
    captions_url    text,
    thumbnail_url   text,
    waveform_url    text,
    license_id      text,
    transcode_state text NOT NULL DEFAULT 'pending' CHECK (transcode_state IN ('pending','processing','ready','failed')),
    metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- AudioTrack: audio (voiceover, music, ambient, sfx) attached to a slide.
CREATE TABLE IF NOT EXISTS audio_track (
    id              text PRIMARY KEY,
    tenant_id       text NOT NULL,
    slide_id        text,
    workspace_id    text NOT NULL,
    uploader_id     text NOT NULL,
    kind            text NOT NULL CHECK (kind IN ('voiceover','music','ambient','sfx')),
    source_url      text NOT NULL,
    duration_ms     integer NOT NULL,
    volume          real NOT NULL DEFAULT 1.0,
    fade_in_ms      integer NOT NULL DEFAULT 0,
    fade_out_ms     integer NOT NULL DEFAULT 0,
    license_id      text,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- LottieAsset: Lottie/Rive animation files.
CREATE TABLE IF NOT EXISTS lottie_asset (
    id              text PRIMARY KEY,
    tenant_id       text NOT NULL,
    workspace_id    text NOT NULL,
    uploader_id     text NOT NULL,
    name            text NOT NULL,
    format          text NOT NULL CHECK (format IN ('lottie','rive')),
    source_url      text NOT NULL,
    width           integer NOT NULL,
    height          integer NOT NULL,
    state_machine   jsonb,                 -- for Rive files
    license_id      text,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- ARSession: ephemeral WebXR / AR Quick Look session with expiring token.
CREATE TABLE IF NOT EXISTS ar_session (
    id              text PRIMARY KEY,
    tenant_id       text NOT NULL,
    slide_id        text NOT NULL,
    model_asset_id  text NOT NULL,
    token           text NOT NULL UNIQUE,
    expires_at      timestamptz NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- Indexes for hot lookup paths.
CREATE INDEX IF NOT EXISTS video_asset_tenant_idx ON video_asset (tenant_id);
CREATE INDEX IF NOT EXISTS video_asset_transcode_idx ON video_asset (transcode_state);
CREATE INDEX IF NOT EXISTS audio_track_slide_idx ON audio_track (slide_id);
CREATE INDEX IF NOT EXISTS lottie_asset_tenant_format_idx ON lottie_asset (tenant_id, format);
CREATE INDEX IF NOT EXISTS ar_session_expires_idx ON ar_session (expires_at);

-- RLS: enable + tenant_isolation policy on every table.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['video_asset','audio_track','lottie_asset','ar_session']
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
