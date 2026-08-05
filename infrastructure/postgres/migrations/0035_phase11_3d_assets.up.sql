-- 0035_phase11_3d_assets.up.sql
-- Phase 11 (M2.1): 3D asset tables — model_asset, scene, camera_keyframe,
-- shader, license. Tenant isolation via current_setting('app.tenant_id'),
-- matching 0003/0023/0032.

BEGIN;

-- License: tracks usage rights for any asset (model, video, audio, lottie).
-- Created first because model_asset references it.
CREATE TABLE IF NOT EXISTS license (
    id              text PRIMARY KEY,
    tenant_id       text NOT NULL,
    name            text NOT NULL,
    source          text NOT NULL,         -- e.g., 'unsplash', 'pexels', 'user-upload'
    terms_url       text,
    expires_at      timestamptz,
    seats           integer,               -- if limited
    metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- ModelAsset: a 3D model (glTF/GLB/USDZ/CAD) uploaded to the workspace.
CREATE TABLE IF NOT EXISTS model_asset (
    id              text PRIMARY KEY,
    tenant_id       text NOT NULL,
    uploader_id     text NOT NULL,
    name            text NOT NULL,
    format          text NOT NULL CHECK (format IN ('glb','gltf','usdz','step','stp','iges','igs','fbx','obj')),
    source_url      text NOT NULL,         -- CDN URL of the original file
    derived_url     text NOT NULL,         -- CDN URL of the GLB rendition
    thumbnail_url   text,
    poly_count      integer NOT NULL,
    texture_count   integer NOT NULL,
    has_animations  boolean NOT NULL DEFAULT false,
    cad_source_url  text,                  -- for CAD-derived assets
    license_id      text,
    metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Scene: a 3D scene configuration bound to a model asset.
CREATE TABLE IF NOT EXISTS scene (
    id              text PRIMARY KEY,
    tenant_id       text NOT NULL,
    model_asset_id  text NOT NULL,
    environment     jsonb NOT NULL DEFAULT '{}'::jsonb,
    lights          jsonb NOT NULL DEFAULT '[]'::jsonb,
    cameras         jsonb NOT NULL DEFAULT '[]'::jsonb,
    materials       jsonb NOT NULL DEFAULT '{}'::jsonb,
    metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- CameraKeyframe: a camera position/orientation keyframe on a slide timeline.
CREATE TABLE IF NOT EXISTS camera_keyframe (
    id              text PRIMARY KEY,
    tenant_id       text NOT NULL,
    slide_id        text NOT NULL,
    scene_id        text,
    order_index     integer NOT NULL,
    position        jsonb NOT NULL,        -- {x, y, z}
    target          jsonb NOT NULL,        -- {x, y, z}
    fov             real NOT NULL,
    roll            real NOT NULL DEFAULT 0,
    easing          jsonb NOT NULL,        -- bezier control points
    duration_ms     integer NOT NULL,
    trigger         text NOT NULL DEFAULT 'auto' CHECK (trigger IN ('auto','click','scroll','data')),
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- Shader: custom WGSL/GLSL shaders (background, particle, material, post).
CREATE TABLE IF NOT EXISTS shader (
    id              text PRIMARY KEY,
    tenant_id       text NOT NULL,
    workspace_id    text NOT NULL,
    author_id       text NOT NULL,
    name            text NOT NULL,
    kind            text NOT NULL CHECK (kind IN ('background','particle','material','post')),
    source_wgsl     text NOT NULL,
    source_glsl     text NOT NULL,
    inputs          jsonb NOT NULL DEFAULT '{}'::jsonb,
    published       boolean NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- Indexes for hot lookup paths.
CREATE INDEX IF NOT EXISTS model_asset_tenant_idx ON model_asset (tenant_id);
CREATE INDEX IF NOT EXISTS model_asset_format_idx ON model_asset (format);
CREATE INDEX IF NOT EXISTS scene_model_asset_idx ON scene (model_asset_id);
CREATE INDEX IF NOT EXISTS camera_keyframe_slide_order_idx ON camera_keyframe (slide_id, order_index);
CREATE INDEX IF NOT EXISTS shader_tenant_kind_idx ON shader (tenant_id, kind);

-- RLS: enable + tenant_isolation policy on every table.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['license','model_asset','scene','camera_keyframe','shader']
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
