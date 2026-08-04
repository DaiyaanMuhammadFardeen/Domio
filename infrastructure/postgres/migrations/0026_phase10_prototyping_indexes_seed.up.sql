-- 0026_phase10_prototyping_indexes_seed.up.sql
-- Phase 10 indexes + seed hotspots/overlays per tenant.

BEGIN;

-- Indexes
CREATE INDEX IF NOT EXISTS hotspot_tenant_deck_slide_idx ON hotspot (tenant_id, deck_id, slide_id);
CREATE INDEX IF NOT EXISTS hotspot_geometry_gin_idx     ON hotspot USING gin (geometry);
CREATE INDEX IF NOT EXISTS overlay_tenant_deck_slide_idx ON overlay (tenant_id, deck_id, slide_id);
CREATE INDEX IF NOT EXISTS branching_edge_tenant_deck_idx ON branching_edge (tenant_id, deck_id);
CREATE INDEX IF NOT EXISTS branching_edge_from_idx        ON branching_edge (from_slide_id);
CREATE INDEX IF NOT EXISTS branching_edge_to_idx          ON branching_edge (to_slide_id);
CREATE INDEX IF NOT EXISTS interaction_state_tenant_deck_idx ON interaction_state (tenant_id, deck_id);
CREATE INDEX IF NOT EXISTS interaction_state_machine_gin_idx ON interaction_state USING gin (state_machine);
CREATE INDEX IF NOT EXISTS variable_tenant_deck_idx        ON variable (tenant_id, deck_id);
CREATE INDEX IF NOT EXISTS variable_binding_tenant_deck_idx ON variable_binding (tenant_id, deck_id);
CREATE INDEX IF NOT EXISTS variable_binding_variable_idx    ON variable_binding (variable_id);
CREATE INDEX IF NOT EXISTS conditional_rule_deck_priority_idx ON conditional_rule (deck_id, priority DESC);

-- Seed: 4 default hotspots + 2 default overlays per tenant. The seed
-- is keyed on `(tenant_id, deck_id)`; concrete tenant seeds run in a
-- later fixture migration. For now, the inserts target a `system`
-- tenant used in tests.
INSERT INTO hotspot (id, tenant_id, deck_id, slide_id, name, geometry, gesture_mask, target_type, target_ref)
VALUES
  ('01H000000000000000000P101', 'system', 'system-deck', 'system-slide-1', 'Next',  '{"kind":"rect","x":0.7,"y":0.0,"w":0.3,"h":0.1}', '{click}',          'slide', '{"slideId":"system-slide-2"}'),
  ('01H000000000000000000P102', 'system', 'system-deck', 'system-slide-1', 'Info',  '{"kind":"rect","x":0.0,"y":0.0,"w":0.2,"h":0.1}', '{click,hover}',  'overlay','{"overlayId":"system-overlay-info"}'),
  ('01H000000000000000000P103', 'system', 'system-deck', 'system-slide-2', 'Back',  '{"kind":"rect","x":0.0,"y":0.0,"w":0.2,"h":0.1}', '{click}',          'slide', '{"slideId":"system-slide-1"}'),
  ('01H000000000000000000P104', 'system', 'system-deck', 'system-slide-2', 'Reset', '{"kind":"rect","x":0.4,"y":0.0,"w":0.2,"h":0.1}', '{click}',          'action','{"kind":"set_variable","params":{"name":"TIER","value":"monthly"}}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO overlay (id, tenant_id, deck_id, slide_id, name, type, size_strategy, anchor, open_trigger, close_trigger, persistent, schema)
VALUES
  ('01H000000000000000000P201', 'system', 'system-deck', 'system-slide-1', 'Info tooltip', 'tooltip', 'auto', '{"x":0.5,"y":0.5}', '{"kind":"hover","params":{"targetId":"system-slide-1"}}', '{"kind":"click_outside"}', false, '{}'),
  ('01H000000000000000000P202', 'system', 'system-deck', 'system-slide-2', 'Confirm modal','modal',   'small', NULL,               '{"kind":"action","params":{"action":"submit_form"}}',       '{"kind":"close_button"}', false, '{}')
ON CONFLICT (id) DO NOTHING;

COMMIT;