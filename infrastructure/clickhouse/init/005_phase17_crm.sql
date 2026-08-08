-- 005_phase17_crm.sql
-- Phase 17 W7 — CRM sync warehouse tables.
--
-- crm_sync_record — one row per (workspace, viewer, event) that we
--                    tried to push to a CRM. The (connection_id,
--                    idempotency_key) pair is unique so retries
--                    collapse to a single row in the warehouse
--                    (matching the Postgres UNIQUE constraint in
--                    0061_analytics_crm.up.sql).
--
-- crm_sync_field_map — declarative mapping from AnalyticsEvent
--                       fields to CRM contact fields. Mirrors the
--                       Postgres table but the ClickHouse copy is
--                       read-only — the dashboard reads it to show
--                       "where will this event land?" in the
--                       settings UI.

CREATE TABLE IF NOT EXISTS domio_analytics.crm_sync_record
(
    sync_id          UUID DEFAULT generateUUIDv4(),
    workspace_id     LowCardinality(String),
    connection_id    UUID,
    viewer_id_key    String,
    event_id         String,
    event_name       LowCardinality(String),
    -- 'success' | 'failed' | 'pending' | 'dead'
    state            LowCardinality(String) DEFAULT 'pending',
    attempts         UInt32 DEFAULT 0,
    last_error       String DEFAULT '',
    synced_at        Nullable(DateTime64(3, 'UTC')),
    next_retry_at    Nullable(DateTime64(3, 'UTC')),
    created_at       DateTime64(3, 'UTC') DEFAULT now64(3),
    idempotency_key  String,
    provider         LowCardinality(String) DEFAULT '',
    -- Materialized at ingest from the connection's provider.
    -- Used for the per-provider success-rate dashboard tile.
    INDEX idx_idem (idempotency_key) TYPE bloom_filter(0.01) GRANULARITY 4,
    INDEX idx_state (state) TYPE set(8) GRANULARITY 4
)
ENGINE = ReplacingMergeTree(created_at)
PARTITION BY toYYYYMM(created_at)
ORDER BY (workspace_id, connection_id, idempotency_key)
TTL toDateTime(created_at) + INTERVAL 13 MONTH DELETE;

CREATE TABLE IF NOT EXISTS domio_analytics.crm_sync_field_map
(
    map_id          UUID DEFAULT generateUUIDv4(),
    workspace_id    LowCardinality(String),
    connection_id   UUID,
    source_field    LowCardinality(String),
    target_field    LowCardinality(String),
    transform       LowCardinality(String) DEFAULT 'identity',
    created_at      DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = ReplacingMergeTree(created_at)
PARTITION BY toYYYYMM(created_at)
ORDER BY (workspace_id, connection_id, source_field, target_field)
TTL toDateTime(created_at) + INTERVAL 13 MONTH DELETE;
