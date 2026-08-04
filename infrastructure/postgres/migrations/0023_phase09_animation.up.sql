-- 0023_phase09_animation.up.sql
-- Phase 09: Animation & Transition System — data plane (10 tables + RLS).
-- Tenant isolation via current_setting('app.tenant_id'), matching 0003/0021.

BEGIN;

-- Timeline: a keyframe timeline attached to a deck or a single element.
CREATE TABLE IF NOT EXISTS timeline (
    id              text PRIMARY KEY,
    tenant_id       text NOT NULL,
    deck_id         text NOT NULL,
    element_id      text,
    duration_ms     integer NOT NULL CHECK (duration_ms BETWEEN 1 AND 60000),
    loop            boolean NOT NULL DEFAULT false,
    play_count      integer CHECK (play_count BETWEEN 1 AND 100),
    start_offset_ms integer NOT NULL DEFAULT 0 CHECK (start_offset_ms >= 0),
    version         integer NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS timeline_track (
    id          text PRIMARY KEY,
    tenant_id   text NOT NULL,
    timeline_id text NOT NULL REFERENCES timeline(id) ON DELETE CASCADE,
    property    text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS timeline_keyframe (
    id         text PRIMARY KEY,
    tenant_id  text NOT NULL,
    track_id   text NOT NULL REFERENCES timeline_track(id) ON DELETE CASCADE,
    time_ms    integer NOT NULL CHECK (time_ms >= 0),
    value      jsonb NOT NULL,
    easing     text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS timeline_trigger (
    id          text PRIMARY KEY,
    tenant_id   text NOT NULL,
    timeline_id text NOT NULL REFERENCES timeline(id) ON DELETE CASCADE,
    kind        text NOT NULL CHECK (kind IN ('on_click','on_enter','on_hover','on_data_change','on_timer')),
    source_id   text,
    field_path  text,
    debounce_ms integer NOT NULL DEFAULT 250 CHECK (debounce_ms >= 0),
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS easing_curve (
    id         text PRIMARY KEY,
    tenant_id  text NOT NULL,
    name       text NOT NULL,
    type       text NOT NULL CHECK (type IN ('linear','step','cubic-bezier','spring','physics')),
    params     jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS animation_preset (
    id          text PRIMARY KEY,
    tenant_id   text NOT NULL,
    name        text NOT NULL,
    category    text NOT NULL CHECK (category IN ('entrance','exit','emphasis')),
    tags        text[] NOT NULL DEFAULT '{}',
    kind        text NOT NULL,
    requires    text[] NOT NULL DEFAULT '{}',
    duration_ms integer NOT NULL DEFAULT 0 CHECK (duration_ms BETWEEN 0 AND 60000),
    keyframes   jsonb NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transition (
    id            text PRIMARY KEY,
    tenant_id     text NOT NULL,
    deck_id       text NOT NULL,
    from_slide_id text NOT NULL,
    to_slide_id   text NOT NULL,
    kind          text NOT NULL CHECK (kind IN ('fade','slide','zoom','flip','cube','cover','reveal','blinds')),
    duration_ms   integer NOT NULL CHECK (duration_ms BETWEEN 50 AND 10000),
    easing        text NOT NULL,
    direction     text CHECK (direction IN ('forward','backward')),
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reduced_motion_settings (
    deck_id    text PRIMARY KEY,
    tenant_id  text NOT NULL,
    policy     text NOT NULL CHECK (policy IN ('follow_os','always_reduced','always_full')),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS magic_move_config (
    id            text PRIMARY KEY,
    tenant_id     text NOT NULL,
    deck_id       text NOT NULL,
    from_slide_id text NOT NULL,
    to_slide_id   text NOT NULL,
    element_role  text NOT NULL,
    duration_ms   integer NOT NULL CHECK (duration_ms BETWEEN 50 AND 10000),
    easing        text NOT NULL,
    properties    text[] NOT NULL DEFAULT '{transform,opacity}',
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS animation_export_job (
    id          text PRIMARY KEY,
    tenant_id   text NOT NULL,
    deck_id     text NOT NULL,
    format      text NOT NULL CHECK (format IN ('gif','mp4','webm')),
    range       jsonb NOT NULL,
    scale       numeric NOT NULL DEFAULT 1 CHECK (scale BETWEEN 0.25 AND 2),
    fps         integer NOT NULL DEFAULT 30 CHECK (fps BETWEEN 1 AND 60),
    status      text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','rendering','encoding','done','failed')),
    error       text,
    artifact    jsonb,
    created_at  timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz
);

-- RLS: enable + tenant_isolation policy on every table.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['timeline','timeline_track','timeline_keyframe','timeline_trigger',
                          'easing_curve','animation_preset','transition','reduced_motion_settings',
                          'magic_move_config','animation_export_job']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format(
      'CREATE POLICY %I_tenant_isolation ON %I USING (tenant_id = current_setting(''app.tenant_id'', true));',
      t, t);
  END LOOP;
END $$;

COMMIT;