-- Roll back migration 0003_deck_schema.up.sql.
-- Child tables are dropped before their parents so this works on a fresh
-- database and on a database populated by the Phase 02 fixture loader.

BEGIN;

DROP TABLE IF EXISTS element_overrides;
DROP TABLE IF EXISTS component_instances;
DROP TABLE IF EXISTS elements;
DROP TABLE IF EXISTS slides;
DROP TABLE IF EXISTS deck_schemas;
DROP TABLE IF EXISTS deck_versions;
DROP TABLE IF EXISTS decks;
DROP TABLE IF EXISTS brand_kits;
DROP TABLE IF EXISTS themes;
DROP TABLE IF EXISTS token_sets;
DROP TABLE IF EXISTS workspaces;
DROP TABLE IF EXISTS tenants;

COMMIT;
