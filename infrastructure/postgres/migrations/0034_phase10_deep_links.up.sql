-- 0034_phase10_deep_links.up.sql
-- Phase 10 M7: Deep-link state codec persistence. One row per
-- shortened link. The signed payload is stored as JSONB so the
-- resolver can replay it through the codec without re-encoding.
--
-- Tenant isolation via current_setting('app.tenant_id', true),
-- matching 0025/0021/0023.

BEGIN;

CREATE TABLE IF NOT EXISTS deep_links (
    id              text PRIMARY KEY,
    tenant_id       text NOT NULL,
    deck_id         text NOT NULL,
    kid             text NOT NULL,
    payload         jsonb NOT NULL,
    click_count     integer NOT NULL DEFAULT 0,
    expires_at      timestamptz NOT NULL,
    viewer_scope    text NOT NULL CHECK (viewer_scope IN ('public','tenant','private')),
    single_use      boolean NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      text
);

-- Index by deck (most common lookup: "list deep links for this deck").
CREATE INDEX IF NOT EXISTS deep_links_deck_idx
    ON deep_links (deck_id);

-- Index by tenant + expiry (GC sweep + tenant admin listings).
CREATE INDEX IF NOT EXISTS deep_links_tenant_expiry_idx
    ON deep_links (tenant_id, expires_at);

-- RLS: enable + tenant_isolation policy.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['deep_links']
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

-- Seed: one demo deep link under the `system` tenant so the
-- migration harness smoke test can resolve something concrete.
INSERT INTO deep_links (id, tenant_id, deck_id, kid, payload, expires_at, viewer_scope, single_use, created_by)
VALUES (
  'dlk_demo01system_000000000000',
  'system',
  'system-deck',
  'dlk_system_deck_0000000001',
  jsonb_build_object(
    'v', 1,
    'exp', 4102444800000,  -- 2100-01-01
    'deck_id', 'system-deck',
    'slide_id', 'system-slide-1',
    'path_stack', ARRAY['system-slide-1']::text[],
    'overlay_stack', ARRAY[]::text[],
    'var_snapshot', '[]'::jsonb,
    'device_frame_state', '{}'::jsonb,
    'scenario', '',
    'form_drafts', '{}'::jsonb,
    'aud', 'viewer',
    'sig', 'seed-no-sig'
  ),
  now() + interval '30 days',
  'public',
  false,
  'system'
)
ON CONFLICT (id) DO NOTHING;

COMMIT;