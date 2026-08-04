-- 0024_phase09_animation_indexes_seed.up.sql
-- Phase 09: indexes + seed data (built-in easing curves + 24 animation presets).
BEGIN;

-- Indexes
CREATE INDEX IF NOT EXISTS timeline_tenant_deck_idx ON timeline (tenant_id, deck_id);
CREATE INDEX IF NOT EXISTS timeline_track_timeline_idx ON timeline_track (timeline_id);
CREATE INDEX IF NOT EXISTS timeline_keyframe_track_idx ON timeline_keyframe (track_id);
CREATE INDEX IF NOT EXISTS timeline_trigger_timeline_idx ON timeline_trigger (timeline_id);
CREATE INDEX IF NOT EXISTS transition_tenant_deck_idx ON transition (tenant_id, deck_id);
CREATE INDEX IF NOT EXISTS magic_move_tenant_deck_idx ON magic_move_config (tenant_id, deck_id);
CREATE INDEX IF NOT EXISTS export_job_tenant_deck_idx ON animation_export_job (tenant_id, deck_id);

-- Seed: built-in easing curves (tenant 'system').
INSERT INTO easing_curve (id, tenant_id, name, type, params) VALUES
  ('01H0000000000000000000000A1', 'system', 'linear',      'linear',       '{}'),
  ('01H0000000000000000000000A2', 'system', 'ease-in',     'cubic-bezier', '{"x1":0.42,"y1":0,"x2":1,"y2":1}'),
  ('01H0000000000000000000000A3', 'system', 'ease-out',    'cubic-bezier', '{"x1":0,"y1":0,"x2":0.58,"y2":1}'),
  ('01H0000000000000000000000A4', 'system', 'ease-in-out', 'cubic-bezier', '{"x1":0.42,"y1":0,"x2":0.58,"y2":1}'),
  ('01H0000000000000000000000A5', 'system', 'wobbly',      'spring',       '{"mass":1,"stiffness":180,"damping":12}'),
  ('01H0000000000000000000000A6', 'system', 'snappy',      'spring',       '{"mass":1,"stiffness":500,"damping":30}'),
  ('01H0000000000000000000000A7', 'system', 'gentle',      'spring',       '{"mass":1,"stiffness":80,"damping":14}'),
  ('01H0000000000000000000000A8', 'system', 'gravity',     'physics',      '{"kind":"gravity"}'),
  ('01H0000000000000000000000A9', 'system', 'throw',       'physics',      '{"kind":"throw"}'),
  ('01H0000000000000000000000AA', 'system', 'bounce',      'physics',      '{"kind":"bounce"}')
ON CONFLICT (tenant_id, name) DO NOTHING;

-- Seed: 24 animation presets (8 entrance, 8 exit, 8 emphasis).
INSERT INTO animation_preset (id, tenant_id, name, category, tags, kind, requires, duration_ms, keyframes) VALUES
  ('01H0000000000000000000000B1', 'system', 'Fade In',      'entrance', '{fade}', 'fade-in', '{}', 400, '[{"t":0,"v":{"opacity":0}},{"t":1,"v":{"opacity":1}}]'),
  ('01H0000000000000000000000B2', 'system', 'Slide Up',     'entrance', '{slide}', 'slide-up', '{}', 500, '[{"t":0,"v":{"y":40,"opacity":0}},{"t":1,"v":{"y":0,"opacity":1}}]'),
  ('01H0000000000000000000000B3', 'system', 'Slide Down',   'entrance', '{slide}', 'slide-down', '{}', 500, '[{"t":0,"v":{"y":-40,"opacity":0}},{"t":1,"v":{"y":0,"opacity":1}}]'),
  ('01H0000000000000000000000B4', 'system', 'Slide Left',   'entrance', '{slide}', 'slide-left', '{}', 500, '[{"t":0,"v":{"x":40,"opacity":0}},{"t":1,"v":{"x":0,"opacity":1}}]'),
  ('01H0000000000000000000000B5', 'system', 'Slide Right',  'entrance', '{slide}', 'slide-right', '{}', 500, '[{"t":0,"v":{"x":-40,"opacity":0}},{"t":1,"v":{"x":0,"opacity":1}}]'),
  ('01H0000000000000000000000B6', 'system', 'Zoom In',      'entrance', '{zoom}', 'zoom-in', '{}', 400, '[{"t":0,"v":{"scale":0.5,"opacity":0}},{"t":1,"v":{"scale":1,"opacity":1}}]'),
  ('01H0000000000000000000000B7', 'system', 'Zoom Out',     'entrance', '{zoom}', 'zoom-out', '{}', 400, '[{"t":0,"v":{"scale":1.5,"opacity":0}},{"t":1,"v":{"scale":1,"opacity":1}}]'),
  ('01H0000000000000000000000B8', 'system', 'Blur In',      'entrance', '{blur}', 'blur-in', '{}', 450, '[{"t":0,"v":{"blur":8,"opacity":0}},{"t":1,"v":{"blur":0,"opacity":1}}]'),
  ('01H0000000000000000000000C1', 'system', 'Fade Out',     'exit', '{fade}', 'fade-out', '{}', 300, '[{"t":0,"v":{"opacity":1}},{"t":1,"v":{"opacity":0}}]'),
  ('01H0000000000000000000000C2', 'system', 'Slide Out Up', 'exit', '{slide}', 'slide-out-up', '{}', 400, '[{"t":0,"v":{"y":0,"opacity":1}},{"t":1,"v":{"y":-40,"opacity":0}}]'),
  ('01H0000000000000000000000C3', 'system', 'Slide Out Down','exit', '{slide}', 'slide-out-down', '{}', 400, '[{"t":0,"v":{"y":0,"opacity":1}},{"t":1,"v":{"y":40,"opacity":0}}]'),
  ('01H0000000000000000000000C4', 'system', 'Slide Out Left','exit', '{slide}', 'slide-out-left', '{}', 400, '[{"t":0,"v":{"x":0,"opacity":1}},{"t":1,"v":{"x":-40,"opacity":0}}]'),
  ('01H0000000000000000000000C5', 'system', 'Slide Out Right','exit', '{slide}', 'slide-out-right', '{}', 400, '[{"t":0,"v":{"x":0,"opacity":1}},{"t":1,"v":{"x":40,"opacity":0}}]'),
  ('01H0000000000000000000000C6', 'system', 'Zoom Out',     'exit', '{zoom}', 'zoom-out', '{}', 300, '[{"t":0,"v":{"scale":1,"opacity":1}},{"t":1,"v":{"scale":0.5,"opacity":0}}]'),
  ('01H0000000000000000000000C7', 'system', 'Blur Out',     'exit', '{blur}', 'blur-out', '{}', 350, '[{"t":0,"v":{"blur":0,"opacity":1}},{"t":1,"v":{"blur":8,"opacity":0}}]'),
  ('01H0000000000000000000000C8', 'system', 'Shrink',       'exit', '{scale}', 'shrink', '{}', 300, '[{"t":0,"v":{"scale":1}},{"t":1,"v":{"scale":0}}]'),
  ('01H0000000000000000000000D1', 'system', 'Pulse',        'emphasis', '{scale}', 'pulse', '{}', 600, '[{"t":0,"v":{"scale":1}},{"t":0.5,"v":{"scale":1.05}},{"t":1,"v":{"scale":1}}]'),
  ('01H0000000000000000000000D2', 'system', 'Wobble',       'emphasis', '{rotate}', 'wobble', '{}', 700, '[{"t":0,"v":{"rotate":0}},{"t":0.25,"v":{"rotate":-3}},{"t":0.5,"v":{"rotate":3}},{"t":0.75,"v":{"rotate":-2}},{"t":1,"v":{"rotate":0}}]'),
  ('01H0000000000000000000000D3', 'system', 'Shake',        'emphasis', '{translate}', 'shake', '{}', 500, '[{"t":0,"v":{"x":0}},{"t":0.2,"v":{"x":-6}},{"t":0.4,"v":{"x":6}},{"t":0.6,"v":{"x":-4}},{"t":0.8,"v":{"x":4}},{"t":1,"v":{"x":0}}]'),
  ('01H0000000000000000000000D4', 'system', 'Flash',        'emphasis', '{opacity}', 'flash', '{}', 600, '[{"t":0,"v":{"opacity":1}},{"t":0.5,"v":{"opacity":0.2}},{"t":1,"v":{"opacity":1}}]'),
  ('01H0000000000000000000000D5', 'system', 'Bounce',       'emphasis', '{translate}', 'bounce', '{}', 800, '[{"t":0,"v":{"y":0}},{"t":0.5,"v":{"y":-20}},{"t":1,"v":{"y":0}}]'),
  ('01H0000000000000000000000D6', 'system', 'Glow',         'emphasis', '{shadow}', 'glow', '{}', 900, '[{"t":0,"v":{"shadow":0}},{"t":0.5,"v":{"shadow":12}},{"t":1,"v":{"shadow":0}}]'),
  ('01H0000000000000000000000D7', 'system', 'Swing',        'emphasis', '{rotate}', 'swing', '{}', 900, '[{"t":0,"v":{"rotate":0}},{"t":0.3,"v":{"rotate":8}},{"t":0.6,"v":{"rotate":-6}},{"t":1,"v":{"rotate":0}}]'),
  ('01H0000000000000000000000D8', 'system', 'Tada',         'emphasis', '{scale,rotate}', 'tada', '{}', 1000, '[{"t":0,"v":{"scale":1,"rotate":0}},{"t":0.3,"v":{"scale":1.1,"rotate":-3}},{"t":0.6,"v":{"scale":1.1,"rotate":3}},{"t":1,"v":{"scale":1,"rotate":0}}]')
ON CONFLICT (id) DO NOTHING;

COMMIT;