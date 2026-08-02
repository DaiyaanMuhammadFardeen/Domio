-- Migration 0015: Phase 06 — icon index.
--
-- The 100k-scale icon corpus is ingested by workers/icon-importer; this
-- migration provides the storage + query structures (trigram name search,
-- synonym array, perceptual-hash column for similarity search, per-icon
-- license for commercial-redistribution filtering).

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS icons (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name            text NOT NULL,
    synonyms        text[] NOT NULL DEFAULT '{}',
    styles          text[] NOT NULL DEFAULT '{}',
    path_data       text NOT NULL,
    view_box        text NOT NULL DEFAULT '0 0 24 24',
    vendor          text NOT NULL,
    license_id      text NOT NULL,
    perceptual_hash text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (vendor, name)
);

CREATE INDEX IF NOT EXISTS icons_name_trgm_idx
    ON icons USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS icons_synonyms_idx
    ON icons USING gin (synonyms);

CREATE INDEX IF NOT EXISTS icons_perceptual_hash_idx
    ON icons (perceptual_hash);

ALTER TABLE icons ENABLE ROW LEVEL SECURITY;

COMMIT;
