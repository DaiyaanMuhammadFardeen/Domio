-- Phase 17 — ClickHouse base schema (events table + projection columns).
--
-- Idempotent: uses CREATE TABLE IF NOT EXISTS / CREATE DATABASE IF NOT EXISTS.
-- Applied by infrastructure/migrators/clickhouse.
--
-- Design notes:
--   * `events` is the canonical ingest landing zone. Every raw event from
--     services/event-ingest lands here via workers/columnar-loader.
--   * Partition by toYYYYMM(ts) keeps partition cardinality bounded and
--     enables fast DROP PARTITION for cold retention / GDPR erasure.
--   * Sort by (workspace_id, deck_id, ts) so the most common query
--     pattern — "all events for one deck in a time window" — reads a
--     contiguous range.
--   * Projection columns support the per-viewer detail queries that
--     dashboard drill-downs need without a separate ORDER BY.
--   * LowCardinality on tenant keys keeps the dictionary-encoded strings
--     small (R3 in the risk register).
--   * TTL 13 months hot; cold storage handled by /workers/session-archiver
--     which writes Parquet to object-store on a daily rotation.

CREATE DATABASE IF NOT EXISTS domio_analytics;

CREATE TABLE IF NOT EXISTS domio_analytics.events
(
    -- Identity
    event_id         UUID DEFAULT generateUUIDv4(),
    event_name       LowCardinality(String),   -- 'view' | 'interaction' | 'scroll_progress' | ...
    event_version    UInt16 DEFAULT 1,
    schema_version   UInt16 DEFAULT 1,

    -- Tenant + entity keys (partition / sort columns)
    workspace_id     LowCardinality(String),   -- tenant boundary
    deck_id          LowCardinality(String),
    slide_id         LowCardinality(String) DEFAULT '',
    scene_node_id    LowCardinality(String) DEFAULT '',
    viewer_id_key    String DEFAULT '',        -- salted hash, privacy-mode aware
    session_id       String DEFAULT '',        -- assigned by sessionization (W4)
    experiment_id    LowCardinality(String) DEFAULT '',
    variant_id       LowCardinality(String) DEFAULT '',

    -- Time
    ts               DateTime64(3, 'UTC') CODEC(DoubleDelta, ZSTD(1)),
    server_ts        DateTime64(3, 'UTC') DEFAULT now64(3) CODEC(DoubleDelta, ZSTD(1)),
    ingestion_lag_ms Int32 DEFAULT 0 CODEC(ZSTD(1)),

    -- Privacy mode (denormalized so analytics queries don't need a join)
    privacy_mode     Enum8(
        'identified'          = 1,
        'pseudonymous'        = 2,
        'anon_consent'        = 3,
        'anon_no_track'       = 4
    ) DEFAULT 'pseudonymous',

    -- Device + referer (PII stripper applied at ingest)
    device_class     Enum8('mobile' = 1, 'tablet' = 2, 'desktop' = 3, 'bot' = 4) DEFAULT 'desktop',
    ua_family        LowCardinality(String) DEFAULT '',
    os_family        LowCardinality(String) DEFAULT '',
    referer_host     LowCardinality(String) DEFAULT '',
    country_iso      LowCardinality(FixedString(2)) DEFAULT 'XX',
    region_pinned    LowCardinality(String) DEFAULT 'global',  -- 'global' | 'bd' for residency

    -- Engagement numerics
    dwell_ms         Int32 DEFAULT 0 CODEC(ZSTD(1)),
    scroll_depth     Float32 DEFAULT 0 CODEC(ZSTD(1)),
    interaction_kind LowCardinality(String) DEFAULT '',
    interaction_data String DEFAULT '' CODEC(ZSTD(3)),-- JSON blob

    -- Source metadata
    source_app       LowCardinality(String) DEFAULT '', -- 'viewer' | 'presenter' | 'join-web'
    ingest_topic     LowCardinality(String) DEFAULT '',
    forward_compat   UInt8 DEFAULT 0,                    -- 1 if event was not in v1 schema

    -- Audit
    audit_chain_hash String DEFAULT '' CODEC(ZSTD(1)),
    audit_seq        UInt64 DEFAULT 0 CODEC(ZSTD(1)),

    -- Indexes
    INDEX idx_viewer_ts (viewer_id_key, ts) TYPE bloom_filter(0.01) GRANULARITY 4,
    INDEX idx_deck_ts (deck_id, ts) TYPE bloom_filter(0.01) GRANULARITY 4,
    INDEX idx_session (session_id) TYPE bloom_filter(0.01) GRANULARITY 4
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(ts)
ORDER BY (workspace_id, deck_id, ts)
TTL toDateTime(ts) + INTERVAL 13 MONTH DELETE
SETTINGS
    index_granularity = 8192,
    min_bytes_for_wide_part = 0;

-- Projection for per-viewer detail queries (R3 latency SLO).
ALTER TABLE domio_analytics.events
    ADD PROJECTION IF NOT EXISTS p_viewer_ts
    (
        SELECT *
        ORDER BY (workspace_id, viewer_id_key, ts)
    );

-- Projection for per-session detail queries (used by sessionization replay).
ALTER TABLE domio_analytics.events
    ADD PROJECTION IF NOT EXISTS p_session_ts
    (
        SELECT *
        ORDER BY (workspace_id, session_id, ts)
    );

-- Projection for per-experiment / per-variant aggregate queries (A/B).
ALTER TABLE domio_analytics.events
    ADD PROJECTION IF NOT EXISTS p_experiment_variant
    (
        SELECT
        workspace_id,
        experiment_id,
        variant_id,
        event_name,
        count() AS n,
        sum(dwell_ms) AS dwell_total
        GROUP BY workspace_id, experiment_id, variant_id, event_name
        ORDER BY (workspace_id, experiment_id, variant_id, event_name)
    );

-- Tombstone table for GDPR erasure — records deleted viewer_id_keys so
-- late-arriving events for an erased viewer are dropped at ingest.
CREATE TABLE IF NOT EXISTS domio_analytics.viewer_tombstone
(
    viewer_id_key   String,
    workspace_id    LowCardinality(String),
    erased_at       DateTime64(3, 'UTC') DEFAULT now64(3),
    erased_by       LowCardinality(String) DEFAULT '',
    reason          LowCardinality(String) DEFAULT 'gdpr_erasure'
)
ENGINE = ReplacingMergeTree(erased_at)
ORDER BY (workspace_id, viewer_id_key)
TTL toDateTime(erased_at) + INTERVAL 7 YEAR DELETE;

-- Consent events table (mirrored from viewer-identity for fast privacy-mode
-- lookups during ingestion).
CREATE TABLE IF NOT EXISTS domio_analytics.consent_events
(
    event_id        String,
    viewer_id       String,
    viewer_id_key   String,
    workspace_id    LowCardinality(String),
    ts              DateTime64(3, 'UTC'),
    action          Enum8(
        'granted'        = 1,
        'withdrawn'      = 2,
        'optout'         = 3,
        'erasure'        = 4,
        'export'         = 5,
        'object'         = 6
    ),
    privacy_mode    Enum8(
        'identified'      = 1,
        'pseudonymous'    = 2,
        'anon_consent'    = 3,
        'anon_no_track'   = 4
    ),
    source          LowCardinality(String) DEFAULT ''
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(ts)
ORDER BY (workspace_id, viewer_id_key, ts)
TTL toDateTime(ts) + INTERVAL 13 MONTH DELETE;

-- Viewer identity long table (mirrored from Postgres viewer table for
-- fast privacy-mode lookups during ingestion and GDPR verification).
CREATE TABLE IF NOT EXISTS domio_analytics.viewer_identity_long
(
    viewer_id       String,
    workspace_id    LowCardinality(String),
    viewer_id_key   String,
    privacy_mode    Enum8(
        'identified'      = 1,
        'pseudonymous'    = 2,
        'anon_consent'    = 3,
        'anon_no_track'   = 4
    ),
    region_pinned   LowCardinality(String) DEFAULT '',
    canonical_id    String DEFAULT '',
    created_at      DateTime64(3, 'UTC'),
    last_seen_at    DateTime64(3, 'UTC'),
    -- ReplacingMergeTree so the latest snapshot of a viewer wins.
    updated_at      DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = ReplacingMergeTree(updated_at)
PARTITION BY toYYYYMM(last_seen_at)
ORDER BY (workspace_id, viewer_id_key)
TTL toDateTime(last_seen_at) + INTERVAL 13 MONTH DELETE;

-- Sessions long table (mirrored from Postgres session table for
-- fast session aggregation in the warehouse).
CREATE TABLE IF NOT EXISTS domio_analytics.sessions_long
(
    session_id      String,
    workspace_id    LowCardinality(String),
    viewer_id_key   String,
    deck_id         String,
    source_app      LowCardinality(String),
    privacy_mode    LowCardinality(String),
    device_class    LowCardinality(String),
    region_pinned   LowCardinality(String) DEFAULT '',
    country_iso     LowCardinality(String) DEFAULT '',
    started_at_ms   DateTime64(3, 'UTC'),
    last_event_at_ms DateTime64(3, 'UTC'),
    ended_at_ms     Nullable(DateTime64(3, 'UTC')),
    event_count     UInt32,
    state           LowCardinality(String) DEFAULT 'open',
    updated_at      DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = ReplacingMergeTree(updated_at)
PARTITION BY toYYYYMM(started_at_ms)
ORDER BY (workspace_id, viewer_id_key, started_at_ms)
TTL toDateTime(started_at_ms) + INTERVAL 13 MONTH DELETE;
