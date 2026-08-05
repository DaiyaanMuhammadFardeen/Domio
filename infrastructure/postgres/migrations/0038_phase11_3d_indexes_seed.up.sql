-- 0038_phase11_3d_indexes_seed.up.sql
-- Phase 11: seed data (default licenses + shader presets) and any remaining
-- indexes. Seeding style matches 0024_phase09_animation_indexes_seed.

BEGIN;

-- Seed: default license records (system-tenant).
INSERT INTO license (id, tenant_id, name, source, terms_url, metadata) VALUES
  ('01H000000000000000000L001', 'system', 'User Upload (Original)',  'user-upload',  NULL, '{"requires_attribution":false}'::jsonb),
  ('01H000000000000000000L002', 'system', 'Unsplash License',         'unsplash',     'https://unsplash.com/license', '{"requires_attribution":true,"commercial":true}'::jsonb),
  ('01H000000000000000000L003', 'system', 'Pexels License',           'pexels',       'https://www.pexels.com/license/', '{"requires_attribution":true,"commercial":true}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Seed: default shader presets (system-tenant).
INSERT INTO shader (id, tenant_id, workspace_id, author_id, name, kind, source_wgsl, source_glsl, inputs, published) VALUES
  ('01H000000000000000000S001', 'system', 'system', 'system', 'Aurora Background', 'background',
   -- Minimal WGSL: animated aurora gradient
   'struct Uniforms { time: f32; };
@group(0) @binding(0) var<uniform> u: Uniforms;
@fragment
fn fs_main(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
  let uv = fragCoord.xy / vec2f(1920.0, 1080.0);
  let wave = sin(uv.x * 6.28318 + u.time * 0.5) * 0.5 + 0.5;
  let r = mix(0.1, 0.4, wave);
  let g = mix(0.6, 0.9, wave);
  let b = mix(0.8, 1.0, wave);
  return vec4f(r, g, b, 1.0);
}',
   -- Minimal GLSL equivalent
   '#version 300 es
precision highp float;
uniform float u_time;
in vec2 vUv;
out vec4 fragColor;
void main() {
  float wave = sin(vUv.x * 6.28318 + u_time * 0.5) * 0.5 + 0.5;
  float r = mix(0.1, 0.4, wave);
  float g = mix(0.6, 0.9, wave);
  float b = mix(0.8, 1.0, wave);
  fragColor = vec4(r, g, b, 1.0);
}',
   '{"speed":1.0,"color1":"#1a99e6","color2":"#e6f5ff"}'::jsonb,
   true),
  ('01H000000000000000000S002', 'system', 'system', 'system', 'Minimal Particles', 'particle',
   -- Minimal WGSL: point sprites with circular fade
   'struct Uniforms { time: f32; };
@group(0) @binding(0) var<uniform> u: Uniforms;
@vertex
fn vs_main(@location(0) pos: vec2f, @location(1) seed: f32) -> @builtin(position) vec4f {
  let t = u.time + seed;
  let x = pos.x + sin(t * 0.3) * 0.1;
  let y = pos.y + cos(t * 0.4) * 0.1;
  return vec4f(x, y, 0.0, 1.0);
}',
   -- Minimal GLSL: point sprites with circular fade
   '#version 300 es
precision highp float;
uniform float u_time;
in float vSeed;
out vec4 fragColor;
void main() {
  vec2 pc = gl_PointCoord * 2.0 - 1.0;
  float d = length(pc);
  if (d > 1.0) discard;
  float alpha = 1.0 - d * d;
  fragColor = vec4(1.0, 1.0, 1.0, alpha * 0.8);
}',
   '{"count":256,"size":3.0,"speed":1.0,"color":"#ffffff"}'::jsonb,
   true),
  ('01H000000000000000000S003', 'system', 'system', 'system', 'Subtle Grain Overlay', 'post',
   -- Minimal WGSL: film grain post-effect
   'struct Uniforms { time: f32; resolution: vec2f; };
@group(0) @binding(0) var<uniform> u: Uniforms;
@fragment
fn fs_main(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
  let uv = fragCoord.xy / u.resolution;
  let grain = fract(sin(dot(uv + u.time, vec2f(12.9898, 78.233))) * 43758.5453);
  return vec4f(vec3f(grain * 0.08), 0.0);
}',
   -- Minimal GLSL equivalent
   '#version 300 es
precision highp float;
uniform float u_time;
uniform vec2 u_resolution;
in vec2 vUv;
out vec4 fragColor;
void main() {
  float grain = fract(sin(dot(vUv + u_time, vec2(12.9898, 78.233))) * 43758.5453);
  fragColor = vec4(vec3(grain * 0.08), 0.0);
}',
   '{"intensity":0.08,"speed":1.0}'::jsonb,
   true)
ON CONFLICT (id) DO NOTHING;

COMMIT;
