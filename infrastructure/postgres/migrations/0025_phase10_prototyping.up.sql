-- 0025_phase10_prototyping.up.sql
-- Phase 10 (M1 + M2): Prototyping data plane — hotspots, overlays,
-- branching edges, interaction states, variables, variable bindings,
-- conditional rules. Tenant isolation via current_setting('app.tenant_id'),
-- matching 0003/0021/0023.

BEGIN;

-- Hotspot: a clickable region on a slide that dispatches a target.
CREATE TABLE IF NOT EXISTS hotspot (
    id            text PRIMARY KEY,
    tenant_id     text NOT NULL,
    deck_id       text NOT NULL,
    slide_id      text NOT NULL,
    name          text NOT NULL,
    geometry      jsonb NOT NULL,
    gesture_mask  text[] NOT NULL DEFAULT '{click}',
    z_index       integer NOT NULL DEFAULT 0,
    target_type   text NOT NULL CHECK (target_type IN ('slide','url','overlay','action')),
    target_ref    jsonb NOT NULL,
    status        text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','dangling')),
    version       integer NOT NULL DEFAULT 0,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Overlay: a modal, tooltip, drawer, popover, or sheet.
CREATE TABLE IF NOT EXISTS overlay (
    id             text PRIMARY KEY,
    tenant_id      text NOT NULL,
    deck_id        text NOT NULL,
    slide_id       text NOT NULL,
    name           text NOT NULL,
    type           text NOT NULL CHECK (type IN ('modal','tooltip','drawer','popover','sheet')),
    size_strategy  text NOT NULL CHECK (size_strategy IN ('small','medium','large','fullscreen','auto')),
    anchor         jsonb,
    open_trigger   jsonb,
    close_trigger  jsonb,
    persistent     boolean NOT NULL DEFAULT false,
    schema         jsonb NOT NULL DEFAULT '{}',
    version        integer NOT NULL DEFAULT 0,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Branching edge: a directed transition between two slides.
CREATE TABLE IF NOT EXISTS branching_edge (
    id            text PRIMARY KEY,
    tenant_id     text NOT NULL,
    deck_id       text NOT NULL,
    from_slide_id text NOT NULL,
    to_slide_id   text NOT NULL,
    name          text NOT NULL,
    rule_id       text,
    priority      integer NOT NULL DEFAULT 0,
    created_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, deck_id, from_slide_id, to_slide_id)
);

-- Interaction state: a small FSM attached to a component instance.
CREATE TABLE IF NOT EXISTS interaction_state (
    id            text PRIMARY KEY,
    tenant_id     text NOT NULL,
    deck_id       text NOT NULL,
    instance_id   text NOT NULL,
    state_machine jsonb NOT NULL,
    current_state text NOT NULL,
    scope         text NOT NULL CHECK (scope IN ('session','slide','deck','persistent_session')),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Variable: a typed, scoped variable for the prototype runtime.
CREATE TABLE IF NOT EXISTS variable (
    id            text PRIMARY KEY,
    tenant_id     text NOT NULL,
    deck_id       text NOT NULL,
    name          text NOT NULL,
    scope         text NOT NULL CHECK (scope IN ('deck','slide','component_instance','session','viewer')),
    type          text NOT NULL CHECK (type IN ('string','number','boolean','enum','json','array')),
    enum_values   text[],
    min           numeric,
    max           numeric,
    default_value jsonb NOT NULL,
    visibility    text NOT NULL DEFAULT 'deck_public' CHECK (visibility IN ('deck_public','private','server_only')),
    read_only     boolean NOT NULL DEFAULT false,
    version       integer NOT NULL DEFAULT 0,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, deck_id, name)
);

-- Variable binding: a reactive binding from a variable to a target prop.
CREATE TABLE IF NOT EXISTS variable_binding (
    id            text PRIMARY KEY,
    tenant_id     text NOT NULL,
    deck_id       text NOT NULL,
    variable_id   text NOT NULL,
    target_kind   text NOT NULL CHECK (target_kind IN ('element_prop','slide_prop','deck_prop','overlay_open','hotspot_target')),
    target_id     text NOT NULL,
    target_prop   text NOT NULL,
    transform     text,
    version       integer NOT NULL DEFAULT 0,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Conditional rule: a prioritized predicate that, when true, dispatches an action.
CREATE TABLE IF NOT EXISTS conditional_rule (
    id               text PRIMARY KEY,
    tenant_id        text NOT NULL,
    deck_id          text NOT NULL,
    name             text NOT NULL,
    priority         integer NOT NULL DEFAULT 0,
    condition        jsonb NOT NULL,
    condition_source text NOT NULL,
    scope_slide_id   text,
    action           jsonb NOT NULL,
    enabled          boolean NOT NULL DEFAULT true,
    version          integer NOT NULL DEFAULT 0,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);

-- RLS: enable + tenant_isolation policy on every P10 table.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['hotspot','overlay','branching_edge','interaction_state',
                          'variable','variable_binding','conditional_rule']
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
