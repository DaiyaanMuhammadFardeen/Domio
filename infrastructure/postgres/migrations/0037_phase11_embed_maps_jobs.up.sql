-- 0037_phase11_embed_maps_jobs.up.sql
-- Phase 11: embed/sandbox policies, LaTeX, maps, CAD & video job tables.
-- Tenant isolation via current_setting('app.tenant_id'),
-- matching 0003/0023/0032.

BEGIN;

-- CodeSandboxPolicy: per-workspace limits for sandboxed code execution.
CREATE TABLE IF NOT EXISTS code_sandbox_policy (
    id              text PRIMARY KEY,
    tenant_id       text NOT NULL,
    workspace_id    text NOT NULL,
    name            text NOT NULL,
    max_cpu_ms      integer NOT NULL DEFAULT 8000,
    max_memory_mb   integer NOT NULL DEFAULT 64,
    allow_network   boolean NOT NULL DEFAULT false,
    allow_dom       boolean NOT NULL DEFAULT false,
    allow_console   boolean NOT NULL DEFAULT true,
    allow_import    boolean NOT NULL DEFAULT false,
    module_allowlist jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- EmbedPolicy: per-workspace iframe embedding rules (origins, sandbox flags, JWT).
CREATE TABLE IF NOT EXISTS embed_policy (
    id              text PRIMARY KEY,
    tenant_id       text NOT NULL,
    workspace_id    text NOT NULL,
    name            text NOT NULL,
    allowed_origins jsonb NOT NULL DEFAULT '[]'::jsonb,
    sandbox_flags   text NOT NULL DEFAULT 'allow-scripts allow-same-origin allow-forms',
    jwt_required    boolean NOT NULL DEFAULT true,
    jwt_audience    text,
    trap_focus      boolean NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- LatexDoc: rendered LaTeX with edge-cached HTML/SVG and a unique cache key.
CREATE TABLE IF NOT EXISTS latex_doc (
    id              text PRIMARY KEY,
    tenant_id       text NOT NULL,
    workspace_id    text NOT NULL,
    source          text NOT NULL,
    rendered_html   text NOT NULL,
    rendered_svg    text,
    theme_hash      text NOT NULL,
    cache_key       text NOT NULL UNIQUE,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- MapStyle: workspace-level map provider configuration.
CREATE TABLE IF NOT EXISTS map_style (
    id              text PRIMARY KEY,
    tenant_id       text NOT NULL,
    workspace_id    text NOT NULL,
    name            text NOT NULL,
    provider        text NOT NULL CHECK (provider IN ('mapbox','google','maplibre','custom')),
    style_url       text NOT NULL,
    api_key_id      text,
    default_zoom    real NOT NULL DEFAULT 2,
    default_lng     real NOT NULL DEFAULT 0,
    default_lat     real NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- CadJobs: tracks a CAD→glTF tessellation/decimation job.
CREATE TABLE IF NOT EXISTS cad_jobs (
    id                      text PRIMARY KEY,
    tenant_id               text NOT NULL,
    model_asset_id          text NOT NULL,
    tessellation_chord_mm   numeric NOT NULL DEFAULT 0.1,
    tessellation_angle_deg  numeric NOT NULL DEFAULT 15,
    target_poly_count       integer,
    progress                text CHECK (progress IN ('parsing','meshing','optimizing','done','failed')),
    error                   text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    finished_at             timestamptz
);

-- VideoJobs: tracks a video transcode / caption-extraction job.
CREATE TABLE IF NOT EXISTS video_jobs (
    id                    text PRIMARY KEY,
    tenant_id             text NOT NULL,
    video_asset_id        text NOT NULL,
    renditions            jsonb,
    extract_captions      boolean NOT NULL DEFAULT false,
    extract_waveform      boolean NOT NULL DEFAULT false,
    status                text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','done','failed')),
    error                 text,
    created_at            timestamptz NOT NULL DEFAULT now(),
    finished_at           timestamptz
);

-- Indexes for hot lookup paths.
CREATE INDEX IF NOT EXISTS code_sandbox_policy_tenant_idx ON code_sandbox_policy (tenant_id);
CREATE INDEX IF NOT EXISTS latex_doc_cache_key_idx ON latex_doc (cache_key);
CREATE INDEX IF NOT EXISTS map_style_tenant_idx ON map_style (tenant_id);

-- RLS: enable + tenant_isolation policy on every table.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['code_sandbox_policy','embed_policy','latex_doc','map_style','cad_jobs','video_jobs']
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
