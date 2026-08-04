-- Migration 0021: Phase 08 — live data plane.
--
-- Tables: data_connection, data_source, query, dataset_snapshot, scenario,
-- formula_field, chart_widget, chart_binding, annotation, threshold_rule,
-- embed_config, freshness_record.
--
-- All tables are tenant-scoped (tenant_id text, matching the deck schema
-- RLS pattern from 0003) and RLS-enabled. Credentials are NEVER stored
-- here — data_connection.credential_ref is a vault key only.
-- Part of the live-data & interactive-charts substrate (P08).

BEGIN;

-- ---------------------------------------------------------------------------
-- data_connection — per-user/team vaulted credentials.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS data_connection (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      text NOT NULL,
    owner_id       text NOT NULL,
    connector_id   text NOT NULL,
    connector_ver  text NOT NULL,
    label          text NOT NULL,
    scope          text NOT NULL DEFAULT 'personal'
                   CHECK (scope IN ('personal', 'team')),
    credential_ref text NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, owner_id, connector_id, label)
);

CREATE INDEX IF NOT EXISTS data_connection_tenant_idx
    ON data_connection (tenant_id);

-- ---------------------------------------------------------------------------
-- data_source — a queryable endpoint bound to a connection.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS data_source (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     text NOT NULL,
    connection_id uuid NOT NULL REFERENCES data_connection (id) ON DELETE CASCADE,
    name          text NOT NULL,
    kind          text NOT NULL
                  CHECK (kind IN ('sheet', 'table', 'view', 'rest', 'graphql', 'custom')),
    query_spec    jsonb NOT NULL,
    schema_json   jsonb NOT NULL,
    pii_class     text NOT NULL DEFAULT 'none'
                  CHECK (pii_class IN ('none', 'low', 'medium', 'high', 'restricted')),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS data_source_tenant_idx
    ON data_source (tenant_id);

CREATE INDEX IF NOT EXISTS data_source_connection_idx
    ON data_source (connection_id);

-- ---------------------------------------------------------------------------
-- query — declarative chart-spec -> dataset, with a freshness policy.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS query (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    data_source_id   uuid NOT NULL REFERENCES data_source (id) ON DELETE CASCADE,
    tenant_id        text NOT NULL,
    name             text NOT NULL,
    query_spec       jsonb NOT NULL,
    freshness_policy jsonb NOT NULL,
    created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS query_tenant_idx
    ON query (tenant_id);

CREATE INDEX IF NOT EXISTS query_data_source_idx
    ON query (data_source_id);

-- ---------------------------------------------------------------------------
-- scenario — named overlays, DAG via parent_id.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scenario (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   text NOT NULL,
    deck_id     uuid NOT NULL,
    parent_id   uuid REFERENCES scenario (id) ON DELETE SET NULL,
    name        text NOT NULL,
    description text,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scenario_tenant_deck_idx
    ON scenario (tenant_id, deck_id);

-- ---------------------------------------------------------------------------
-- dataset_snapshot — immutable, content-addressed result of a query.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dataset_snapshot (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    query_id    uuid NOT NULL REFERENCES query (id) ON DELETE CASCADE,
    tenant_id   text NOT NULL,
    scenario_id uuid REFERENCES scenario (id) ON DELETE SET NULL,
    hash        text NOT NULL,
    row_count   bigint NOT NULL,
    bytes       bigint NOT NULL,
    obj_key     text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    expires_at  timestamptz
);

CREATE INDEX IF NOT EXISTS dataset_snapshot_query_created_idx
    ON dataset_snapshot (query_id, created_at DESC);

CREATE INDEX IF NOT EXISTS dataset_snapshot_tenant_idx
    ON dataset_snapshot (tenant_id);

-- ---------------------------------------------------------------------------
-- formula_field — spreadsheet AST + version.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS formula_field (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   text NOT NULL,
    deck_id     uuid NOT NULL,
    query_id    uuid REFERENCES query (id) ON DELETE CASCADE,
    name        text NOT NULL,
    expression  text NOT NULL,
    ast_json    jsonb NOT NULL,
    version     integer NOT NULL DEFAULT 1,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS formula_field_tenant_deck_idx
    ON formula_field (tenant_id, deck_id);

CREATE INDEX IF NOT EXISTS formula_field_expression_idx
    ON formula_field USING gin (to_tsvector('simple', expression));

-- ---------------------------------------------------------------------------
-- chart_widget — canvas element of type chart/table/callout.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chart_widget (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    text NOT NULL,
    deck_id      uuid NOT NULL,
    slide_id     uuid NOT NULL,
    component_id uuid NOT NULL,
    type         text NOT NULL,
    props_json   jsonb NOT NULL,
    binding_id   uuid NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chart_widget_tenant_deck_idx
    ON chart_widget (tenant_id, deck_id);

-- ---------------------------------------------------------------------------
-- chart_binding — glue: chart_widget <-> query (field_map + listen_to_filters).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chart_binding (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         text NOT NULL,
    chart_widget_id   uuid NOT NULL REFERENCES chart_widget (id) ON DELETE CASCADE,
    query_id          uuid NOT NULL REFERENCES query (id) ON DELETE RESTRICT,
    field_map         jsonb NOT NULL,
    listen_to_filters text[] NOT NULL DEFAULT '{}',
    created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chart_binding_tenant_idx
    ON chart_binding (tenant_id);

-- ---------------------------------------------------------------------------
-- annotation — pinned text + scenario scope.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS annotation (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       text NOT NULL,
    chart_widget_id uuid NOT NULL REFERENCES chart_widget (id) ON DELETE CASCADE,
    scenario_id     uuid REFERENCES scenario (id) ON DELETE CASCADE,
    bindable_point  jsonb NOT NULL,
    author_id       text NOT NULL,
    text            text NOT NULL,
    color           text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS annotation_tenant_widget_idx
    ON annotation (tenant_id, chart_widget_id);

CREATE INDEX IF NOT EXISTS annotation_text_idx
    ON annotation USING gin (to_tsvector('simple', text));

-- ---------------------------------------------------------------------------
-- threshold_rule — (measure, comparator, values, severity, style_override).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS threshold_rule (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       text NOT NULL,
    chart_widget_id uuid NOT NULL REFERENCES chart_widget (id) ON DELETE CASCADE,
    measure         text NOT NULL,
    comparator      text NOT NULL
                    CHECK (comparator IN ('lt', 'lte', 'gt', 'gte', 'eq', 'between', 'outside')),
    values          jsonb NOT NULL,
    severity        text NOT NULL
                    CHECK (severity IN ('info', 'warn', 'critical')),
    style_override  jsonb NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS threshold_rule_tenant_widget_idx
    ON threshold_rule (tenant_id, chart_widget_id);

-- ---------------------------------------------------------------------------
-- embed_config — {provider, url, sizing, auth_passthrough}.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS embed_config (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        text NOT NULL,
    component_id     uuid NOT NULL,
    provider         text NOT NULL
                     CHECK (provider IN ('looker', 'tableau', 'powerbi', 'grafana', 'custom')),
    url              text NOT NULL,
    sizing           jsonb NOT NULL,
    auth_passthrough jsonb NOT NULL,
    created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS embed_config_tenant_idx
    ON embed_config (tenant_id);

-- ---------------------------------------------------------------------------
-- freshness_record — append-only tracker.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS freshness_record (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   text NOT NULL,
    binding_id  uuid NOT NULL REFERENCES chart_binding (id) ON DELETE CASCADE,
    scenario_id uuid REFERENCES scenario (id) ON DELETE SET NULL,
    snapshot_id uuid REFERENCES dataset_snapshot (id) ON DELETE SET NULL,
    status      text NOT NULL
                CHECK (status IN ('ok', 'stale', 'error', 'never')),
    source      text NOT NULL
                CHECK (source IN ('poll', 'webhook', 'manual')),
    recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS freshness_record_binding_recorded_idx
    ON freshness_record (binding_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS freshness_record_tenant_idx
    ON freshness_record (tenant_id);

-- ---------------------------------------------------------------------------
-- Row-level security. The application sets `app.tenant_id` per request via
-- `SET LOCAL app.tenant_id = '...';`. Privileged roles bypass RLS.
-- ---------------------------------------------------------------------------
ALTER TABLE data_connection  ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_source      ENABLE ROW LEVEL SECURITY;
ALTER TABLE query            ENABLE ROW LEVEL SECURITY;
ALTER TABLE dataset_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE scenario         ENABLE ROW LEVEL SECURITY;
ALTER TABLE formula_field    ENABLE ROW LEVEL SECURITY;
ALTER TABLE chart_widget     ENABLE ROW LEVEL SECURITY;
ALTER TABLE chart_binding    ENABLE ROW LEVEL SECURITY;
ALTER TABLE annotation       ENABLE ROW LEVEL SECURITY;
ALTER TABLE threshold_rule   ENABLE ROW LEVEL SECURITY;
ALTER TABLE embed_config     ENABLE ROW LEVEL SECURITY;
ALTER TABLE freshness_record ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    t text;
    tables text[] := ARRAY[
        'data_connection', 'data_source', 'query', 'dataset_snapshot',
        'scenario', 'formula_field', 'chart_widget', 'chart_binding',
        'annotation', 'threshold_rule', 'embed_config', 'freshness_record'
    ];
BEGIN
    FOREACH t IN ARRAY tables LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = 'public' AND tablename = t
              AND policyname = t || '_tenant_isolation'
        ) THEN
            EXECUTE format(
                'CREATE POLICY %I ON %I USING (
                    tenant_id = current_setting(''app.tenant_id'', true)
                    OR current_setting(''app.bypass_rls'', true) = ''on''
                ) WITH CHECK (
                    tenant_id = current_setting(''app.tenant_id'', true)
                    OR current_setting(''app.bypass_rls'', true) = ''on''
                )',
                t || '_tenant_isolation', t
            );
        END IF;
    END LOOP;
END $$;

COMMIT;