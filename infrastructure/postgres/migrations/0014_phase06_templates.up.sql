-- Migration 0014: Phase 06 — templates, section templates, sticker packs,
-- and brand-locked regions.

BEGIN;

CREATE TABLE IF NOT EXISTS template (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kind            text NOT NULL CHECK (kind IN ('full_deck', 'section')),
    name            text NOT NULL,
    description     text NOT NULL DEFAULT '',
    deck_json       jsonb,
    placeholders    jsonb NOT NULL DEFAULT '[]'::jsonb,
    author_id       text NOT NULL,
    preview         jsonb,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS template_kind_idx
    ON template (kind, created_at DESC);

CREATE TABLE IF NOT EXISTS section_template (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id     uuid NOT NULL REFERENCES template (id) ON DELETE CASCADE,
    name            text NOT NULL,
    slides          jsonb NOT NULL,
    spreadable      boolean NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sticker_pack (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name            text NOT NULL,
    theme           text NOT NULL,
    informal_only   boolean NOT NULL DEFAULT false,
    sticker_component_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS brand_lock_region (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    deck_id         text NOT NULL,
    scope           text NOT NULL CHECK (scope IN ('slide', 'element', 'region')),
    strictness      text NOT NULL DEFAULT 'strict'
                    CHECK (strictness IN ('strict', 'color-only', 'text-only')),
    allowed_overrides jsonb NOT NULL DEFAULT '[]'::jsonb,
    owner_user_id   text NOT NULL,
    scene_graph_selector text NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS brand_lock_region_deck_idx
    ON brand_lock_region (deck_id);

ALTER TABLE template           ENABLE ROW LEVEL SECURITY;
ALTER TABLE section_template   ENABLE ROW LEVEL SECURITY;
ALTER TABLE sticker_pack       ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_lock_region  ENABLE ROW LEVEL SECURITY;

COMMIT;
