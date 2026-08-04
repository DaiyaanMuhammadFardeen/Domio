-- 0026_phase10_prototyping_indexes_seed.down.sql
BEGIN;
DROP INDEX IF EXISTS conditional_rule_deck_priority_idx;
DROP INDEX IF EXISTS variable_binding_variable_idx;
DROP INDEX IF EXISTS variable_binding_tenant_deck_idx;
DROP INDEX IF EXISTS variable_tenant_deck_idx;
DROP INDEX IF EXISTS interaction_state_machine_gin_idx;
DROP INDEX IF EXISTS interaction_state_tenant_deck_idx;
DROP INDEX IF EXISTS branching_edge_to_idx;
DROP INDEX IF EXISTS branching_edge_from_idx;
DROP INDEX IF EXISTS branching_edge_tenant_deck_idx;
DROP INDEX IF EXISTS overlay_tenant_deck_slide_idx;
DROP INDEX IF EXISTS hotspot_geometry_gin_idx;
DROP INDEX IF EXISTS hotspot_tenant_deck_slide_idx;
DELETE FROM overlay WHERE id IN ('01H000000000000000000P201','01H000000000000000000P202');
DELETE FROM hotspot WHERE id IN ('01H000000000000000000P101','01H000000000000000000P102','01H000000000000000000P103','01H000000000000000000P104');
COMMIT;