-- 0025_phase10_prototyping.down.sql
-- Roll back Phase 10 M1+M2 tables.
BEGIN;
DROP TABLE IF EXISTS conditional_rule;
DROP TABLE IF EXISTS variable_binding;
DROP TABLE IF EXISTS variable;
DROP TABLE IF EXISTS interaction_state;
DROP TABLE IF EXISTS branching_edge;
DROP TABLE IF EXISTS overlay;
DROP TABLE IF EXISTS hotspot;
COMMIT;