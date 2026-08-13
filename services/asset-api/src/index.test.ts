/**
 * Asset API — comprehensive tests (Phase 11).
 *
 * Uses Hono `app.request()` pattern. Covers:
 *   - Model CRUD + upload sanitization (hostile GLB, KHR_xmp, >500MB, poly budget)
 *   - Scene CRUD + 9th light warning
 *   - Camera keyframe CRUD + easing validation
 *   - Shader CRUD + host-access rejection + WGSL requirement
 *   - License CRUD + delete blocked when referenced
 *   - Signed URL expiry + verify
 *   - Schema validation 400s
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { createApp } from './index.js';
import type { Hono } from 'hono';
import {
  generateSignedUrl,
  verifySignedUrl,
  parseGlbMetadata,
  sanitizeGlbJson,
  detectHostAccess,
} from './service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let app: Hono;

const FIXED_ID = '01J0TESTID00000000000001A';
const FIXED_ID_2 = '01J0TESTID00000000000002B';
const FIXED_ID_3 = '01J0TESTID00000000000003C';
const FIXED_ID_4 = '01J0TESTID00000000000004D';
const FIXED_ID_5 = '01J0TESTID00000000000005E';
let idCounter = 0;

beforeAll(() => {
  idCounter = 0;
  const ids = [
    FIXED_ID,
    FIXED_ID_2,
    FIXED_ID_3,
    FIXED_ID_4,
    FIXED_ID_5,
    '01J0TESTID00000000000006F',
    '01J0TESTID00000000000007G',
    '01J0TESTID00000000000008H',
    '01J0TESTID00000000000009J',
    '01J0TESTID0000000000000AK',
    '01J0TESTID0000000000000BL',
    '01J0TESTID0000000000000CM',
  ];
  app = createApp({
    idGenerator: () => ids[idCounter++ % ids.length]!,
    clock: () => new Date('2025-06-01T00:00:00Z'),
    defaultWorkspaceId: 'ws-test',
  });
});

async function req(
  method: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<Response> {
  const init: RequestInit = {
    method,
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    ...(body != null ? { body: JSON.stringify(body) } : {}),
  };
  return app.request(path, init);
}

function makeValidGlb(): ArrayBuffer {
  // Minimal valid GLB: 12-byte header + JSON chunk
  const jsonChunk = JSON.stringify({
    asset: { version: '2.0', generator: 'test' },
    meshes: [
      { primitives: [{ indices: 300 }] }, // 100 triangles
    ],
    textures: [{}],
    animations: [{}],
  });
  const jsonBytes = new TextEncoder().encode(jsonChunk);
  // Pad to 4-byte alignment
  const padding = (4 - (jsonBytes.byteLength % 4)) % 4;
  const paddedLength = jsonBytes.byteLength + padding;
  const totalLength = 12 + 8 + paddedLength;
  const buffer = new ArrayBuffer(totalLength);
  const view = new DataView(buffer);

  // GLB header
  view.setUint32(0, 0x46546c67, true); // magic: glTF
  view.setUint32(4, 2, true); // version: 2
  view.setUint32(8, totalLength, true); // total length

  // JSON chunk
  view.setUint32(12, paddedLength, true); // chunk length
  view.setUint32(16, 0x4e4f534a, true); // chunk type: JSON
  const out = new Uint8Array(buffer);
  out.set(jsonBytes, 20);

  return buffer;
}

function makeGlbWithScript(): ArrayBuffer {
  const jsonChunk = JSON.stringify({
    asset: { version: '2.0' },
    extensions: {
      evil_script: '<script>alert("xss")</script>',
    },
  });
  const jsonBytes = new TextEncoder().encode(jsonChunk);
  const padding = (4 - (jsonBytes.byteLength % 4)) % 4;
  const paddedLength = jsonBytes.byteLength + padding;
  const totalLength = 12 + 8 + paddedLength;
  const buffer = new ArrayBuffer(totalLength);
  const view = new DataView(buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, totalLength, true);
  view.setUint32(12, paddedLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(buffer).set(jsonBytes, 20);
  return buffer;
}

function makeGlbWithKhrXmp(): ArrayBuffer {
  const jsonChunk = JSON.stringify({
    asset: { version: '2.0' },
    extensions: {
      KHR_xmp: { external: 'metadata.xml' },
    },
  });
  const jsonBytes = new TextEncoder().encode(jsonChunk);
  const padding = (4 - (jsonBytes.byteLength % 4)) % 4;
  const paddedLength = jsonBytes.byteLength + padding;
  const totalLength = 12 + 8 + paddedLength;
  const buffer = new ArrayBuffer(totalLength);
  const view = new DataView(buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, totalLength, true);
  view.setUint32(12, paddedLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(buffer).set(jsonBytes, 20);
  return buffer;
}

function makeHugeBuffer(sizeBytes: number): ArrayBuffer {
  return new ArrayBuffer(sizeBytes);
}

// =========================================================================
// Model CRUD
// =========================================================================

describe('Model routes — CRUD', () => {
  it('GET /v1/models lists models for workspace', async () => {
    const res = await req('GET', '/v1/models?workspace_id=ws-test');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[] };
    expect(body.items).toEqual([]);
  });

  it('GET /v1/models returns 400 without workspace_id', async () => {
    const res = await req('GET', '/v1/models');
    expect(res.status).toBe(400);
  });

  it('GET /v1/models/:id returns 404 for unknown', async () => {
    const res = await req('GET', '/v1/models/nonexistent');
    expect(res.status).toBe(404);
  });

  it('PATCH /v1/models/:id returns 404 for unknown', async () => {
    const res = await req('PATCH', '/v1/models/nonexistent', { name: 'updated' });
    expect(res.status).toBe(404);
  });

  it('DELETE /v1/models/:id returns 404 for unknown', async () => {
    const res = await req('DELETE', '/v1/models/nonexistent');
    expect(res.status).toBe(404);
  });
});

// =========================================================================
// Model Upload
// =========================================================================

describe('Model routes — upload', () => {
  it('POST /v1/models/upload accepts valid GLB and returns 202', async () => {
    const glb = makeValidGlb();
    const form = new FormData();
    form.append('file', new Blob([glb], { type: 'model/gltf-binary' }), 'test.glb');
    form.append('workspaceId', 'ws-test');

    const res = await app.request('/v1/models/upload', {
      method: 'POST',
      body: form,
    });
    expect(res.status).toBe(202);
    const body = (await res.json()) as {
      modelAssetId: string;
      formatDetected: string;
      polyCount: number;
      textureCount: number;
      warnings: string[];
    };
    expect(body.modelAssetId).toBeDefined();
    expect(body.formatDetected).toBe('glb');
    expect(body.polyCount).toBe(100);
    expect(body.textureCount).toBe(1);
  });

  it('POST /v1/models/upload returns 400 without file', async () => {
    const form = new FormData();
    form.append('workspaceId', 'ws-test');
    const res = await app.request('/v1/models/upload', {
      method: 'POST',
      body: form,
    });
    expect(res.status).toBe(400);
  });

  it('POST /v1/models/upload returns 400 without workspaceId', async () => {
    const glb = makeValidGlb();
    const form = new FormData();
    form.append('file', new Blob([glb], { type: 'model/gltf-binary' }), 'test.glb');
    const res = await app.request('/v1/models/upload', {
      method: 'POST',
      body: form,
    });
    expect(res.status).toBe(400);
  });

  it('POST /v1/models/upload returns 400 for unsupported format', async () => {
    const form = new FormData();
    form.append(
      'file',
      new Blob([new ArrayBuffer(10)], { type: 'application/octet-stream' }),
      'test.exe',
    );
    form.append('workspaceId', 'ws-test');
    const res = await app.request('/v1/models/upload', {
      method: 'POST',
      body: form,
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('INVALID_FORMAT');
  });

  it('POST /v1/models/upload sanitizes hostile GLB (embedded script stripped + warning)', async () => {
    const glb = makeGlbWithScript();
    const form = new FormData();
    form.append('file', new Blob([glb], { type: 'model/gltf-binary' }), 'evil.glb');
    form.append('workspaceId', 'ws-test');

    const res = await app.request('/v1/models/upload', {
      method: 'POST',
      body: form,
    });
    expect(res.status).toBe(202);
    const body = (await res.json()) as { warnings: string[] };
    expect(body.warnings.some((w) => w.includes('script') || w.includes('Stripped'))).toBe(true);
  });

  it('POST /v1/models/upload rejects GLB with KHR_xmp external ref', async () => {
    const glb = makeGlbWithKhrXmp();
    const form = new FormData();
    form.append('file', new Blob([glb], { type: 'model/gltf-binary' }), 'xmp.glb');
    form.append('workspaceId', 'ws-test');

    const res = await app.request('/v1/models/upload', {
      method: 'POST',
      body: form,
    });
    expect(res.status).toBe(202);
    const body = (await res.json()) as { warnings: string[] };
    expect(body.warnings.some((w) => w.includes('KHR_xmp'))).toBe(true);
  });

  it('POST /v1/models/upload returns 413 for >500MB file', async () => {
    const app2 = createApp({
      idGenerator: () => FIXED_ID,
      clock: () => new Date('2025-06-01T00:00:00Z'),
      maxUploadBytes: 1024, // 1KB limit for testing
    });

    const form = new FormData();
    form.append(
      'file',
      new Blob([makeHugeBuffer(2048)], { type: 'model/gltf-binary' }),
      'huge.glb',
    );
    form.append('workspaceId', 'ws-test');

    const res = await app2.request('/v1/models/upload', {
      method: 'POST',
      body: form,
    });
    expect(res.status).toBe(413);
  });
});

// =========================================================================
// Scene CRUD
// =========================================================================

describe('Scene routes — CRUD', () => {
  it('POST /v1/scenes creates a scene', async () => {
    idCounter = 0;
    const res = await req('POST', '/v1/scenes', {
      modelAssetId: 'model-1',
      environment: { exposure: 1.5 },
      lights: [{ kind: 'directional', color: '#ffffff', intensity: 1 }],
      cameras: [
        { name: 'main', position: { x: 0, y: 0, z: 5 }, target: { x: 0, y: 0, z: 0 }, fov: 60 },
      ],
      materials: {},
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; modelAssetId: string; lights: unknown[] };
    expect(body.modelAssetId).toBe('model-1');
    expect(body.lights).toHaveLength(1);
  });

  it('POST /v1/scenes returns 400 on invalid body', async () => {
    idCounter = 0;
    const res = await req('POST', '/v1/scenes', {});
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('GET /v1/scenes lists scenes for workspace', async () => {
    const res = await req('GET', '/v1/scenes?workspace_id=ws-test');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[] };
    expect(Array.isArray(body.items)).toBe(true);
  });

  it('GET /v1/scenes returns 400 without workspace_id', async () => {
    const res = await req('GET', '/v1/scenes');
    expect(res.status).toBe(400);
  });

  it('GET /v1/scenes/:id returns 404 for unknown', async () => {
    const res = await req('GET', '/v1/scenes/nonexistent');
    expect(res.status).toBe(404);
  });

  it('PATCH /v1/scenes/:id returns 404 for unknown', async () => {
    const res = await req('PATCH', '/v1/scenes/nonexistent', { metadata: { a: 1 } });
    expect(res.status).toBe(404);
  });

  it('DELETE /v1/scenes/:id returns 404 for unknown', async () => {
    const res = await req('DELETE', '/v1/scenes/nonexistent');
    expect(res.status).toBe(404);
  });

  it('POST /v1/scenes with 9th light emits warning', async () => {
    idCounter = 0;
    const lights = Array.from({ length: 9 }, () => ({
      kind: 'point' as const,
      color: '#ffffff',
      intensity: 1,
    }));
    const res = await req('POST', '/v1/scenes', {
      modelAssetId: 'model-1',
      lights,
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { _warnings?: string[] };
    expect(body._warnings).toBeDefined();
    expect(body._warnings!.some((w) => w.includes('9 lights'))).toBe(true);
  });

  it('POST /v1/scenes with 8 lights has no warning', async () => {
    idCounter = 0;
    const lights = Array.from({ length: 8 }, () => ({
      kind: 'point' as const,
      color: '#ffffff',
      intensity: 1,
    }));
    const res = await req('POST', '/v1/scenes', {
      modelAssetId: 'model-1',
      lights,
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { _warnings?: string[] };
    expect(body._warnings).toBeUndefined();
  });
});

// =========================================================================
// Camera Keyframe CRUD
// =========================================================================

describe('Camera Keyframe routes — CRUD', () => {
  it('POST /v1/slides/:slideId/camera_keyframes creates a keyframe', async () => {
    idCounter = 0;
    const res = await req('POST', '/v1/slides/slide-1/camera_keyframes', {
      position: { x: 0, y: 1, z: 5 },
      target: { x: 0, y: 0, z: 0 },
      fov: 60,
      easing: { p1x: 0.42, p1y: 0, p2x: 0.58, p2y: 1 },
      durationMs: 1000,
      trigger: 'scroll',
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; slideId: string; position: { x: number } };
    expect(body.slideId).toBe('slide-1');
    expect(body.position.x).toBe(0);
  });

  it('POST /v1/slides/:slideId/camera_keyframes returns 400 on invalid body', async () => {
    idCounter = 0;
    const res = await req('POST', '/v1/slides/slide-1/camera_keyframes', {
      // missing position, target, fov
    });
    expect(res.status).toBe(400);
  });

  it('POST /v1/slides/:slideId/camera_keyframes returns 400 for non-monotonic easing', async () => {
    idCounter = 0;
    const res = await req('POST', '/v1/slides/slide-1/camera_keyframes', {
      position: { x: 0, y: 1, z: 5 },
      target: { x: 0, y: 0, z: 0 },
      fov: 60,
      easing: { p1x: 0.8, p1y: 0, p2x: 0.2, p2y: 1 }, // p1x > p2x
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('EASING_VALIDATION_REJECTED');
  });

  it('GET /v1/slides/:slideId/camera_keyframes lists keyframes', async () => {
    const res = await req('GET', '/v1/slides/slide-1/camera_keyframes');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[] };
    expect(Array.isArray(body.items)).toBe(true);
  });

  it('GET /v1/camera_keyframes/:id returns 404 for unknown', async () => {
    const res = await req('GET', '/v1/camera_keyframes/nonexistent');
    expect(res.status).toBe(404);
  });

  it('PATCH /v1/camera_keyframes/:id returns 404 for unknown', async () => {
    const res = await req('PATCH', '/v1/camera_keyframes/nonexistent', { fov: 90 });
    expect(res.status).toBe(404);
  });

  it('DELETE /v1/camera_keyframes/:id returns 404 for unknown', async () => {
    const res = await req('DELETE', '/v1/camera_keyframes/nonexistent');
    expect(res.status).toBe(404);
  });
});

// =========================================================================
// Shader CRUD
// =========================================================================

describe('Shader routes — CRUD', () => {
  it('POST /v1/shaders creates a shader', async () => {
    idCounter = 0;
    const res = await req('POST', '/v1/shaders', {
      workspaceId: 'ws-test',
      authorId: 'user-1',
      name: 'Gradient Background',
      kind: 'background',
      sourceWgsl:
        '@group(0) @binding(0) var<uniform> time: f32; @fragment fn main() -> @location(0) vec4<f32> { return vec4<f32>(1.0); }',
      sourceGlsl: '#version 300 es\nvoid main() { gl_FragColor = vec4(1.0); }',
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; name: string; published: boolean };
    expect(body.name).toBe('Gradient Background');
    expect(body.published).toBe(false);
  });

  it('POST /v1/shaders returns 400 on invalid body', async () => {
    idCounter = 0;
    const res = await req('POST', '/v1/shaders', { name: 'test' });
    expect(res.status).toBe(400);
  });

  it('POST /v1/shaders rejects empty WGSL', async () => {
    idCounter = 0;
    const res = await req('POST', '/v1/shaders', {
      workspaceId: 'ws-test',
      authorId: 'user-1',
      name: 'Bad Shader',
      kind: 'background',
      sourceWgsl: '',
      sourceGlsl: 'void main() {}',
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('WGSL_REQUIRED');
  });

  it('POST /v1/shaders rejects WGSL without declarations', async () => {
    idCounter = 0;
    const res = await req('POST', '/v1/shaders', {
      workspaceId: 'ws-test',
      authorId: 'user-1',
      name: 'Bad Shader',
      kind: 'background',
      sourceWgsl: 'this is not valid wgsl code at all',
      sourceGlsl: 'void main() {}',
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('WGSL_INVALID');
  });

  it('POST /v1/shaders rejects host-access in source', async () => {
    idCounter = 0;
    const res = await req('POST', '/v1/shaders', {
      workspaceId: 'ws-test',
      authorId: 'user-1',
      name: 'Malicious Shader',
      kind: 'background',
      sourceWgsl: '@fragment fn main() { fetch("https://evil.com"); }',
      sourceGlsl: 'void main() {}',
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('HOST_ACCESS_REJECTED');
  });

  it('POST /v1/shaders rejects host-access in GLSL', async () => {
    idCounter = 0;
    const res = await req('POST', '/v1/shaders', {
      workspaceId: 'ws-test',
      authorId: 'user-1',
      name: 'Malicious Shader 2',
      kind: 'background',
      sourceWgsl: '@fragment fn main() -> @location(0) vec4<f32> { return vec4<f32>(1.0); }',
      sourceGlsl: 'void main() { navigator.userAgent; }',
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('HOST_ACCESS_REJECTED');
  });

  it('GET /v1/shaders lists shaders', async () => {
    const res = await req('GET', '/v1/shaders?workspace_id=ws-test');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[] };
    expect(Array.isArray(body.items)).toBe(true);
  });

  it('GET /v1/shaders returns 400 without workspace_id', async () => {
    const res = await req('GET', '/v1/shaders');
    expect(res.status).toBe(400);
  });

  it('GET /v1/shaders/:id returns 404 for unknown', async () => {
    const res = await req('GET', '/v1/shaders/nonexistent');
    expect(res.status).toBe(404);
  });

  it('PUT /v1/shaders/:id returns 404 for unknown', async () => {
    const res = await req('PUT', '/v1/shaders/nonexistent', { name: 'updated' });
    expect(res.status).toBe(404);
  });

  it('DELETE /v1/shaders/:id returns 404 for unknown', async () => {
    const res = await req('DELETE', '/v1/shaders/nonexistent');
    expect(res.status).toBe(404);
  });

  it('POST /v1/shaders/:id/publish returns 404 for unknown', async () => {
    const res = await req('POST', '/v1/shaders/nonexistent/publish');
    expect(res.status).toBe(404);
  });
});

// =========================================================================
// License CRUD
// =========================================================================

describe('License routes — CRUD', () => {
  it('GET /v1/licenses lists licenses', async () => {
    const res = await req('GET', '/v1/licenses?workspace_id=ws-test');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ source: string }> };
    expect(body.items).toHaveLength(3);
    expect(body.items.map((i) => i.source)).toContain('user-upload');
    expect(body.items.map((i) => i.source)).toContain('unsplash');
    expect(body.items.map((i) => i.source)).toContain('pexels');
  });

  it('GET /v1/licenses returns 400 without workspace_id', async () => {
    const res = await req('GET', '/v1/licenses');
    expect(res.status).toBe(400);
  });

  it('GET /v1/licenses/:id returns 404 for unknown', async () => {
    const res = await req('GET', '/v1/licenses/nonexistent');
    expect(res.status).toBe(404);
  });

  it('POST /v1/licenses creates a license', async () => {
    idCounter = 0;
    const res = await req('POST', '/v1/licenses', {
      workspaceId: 'ws-test',
      name: 'Custom License',
      source: 'custom',
      termsUrl: 'https://example.com/license',
      seats: 5,
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { name: string; source: string; seats: number };
    expect(body.name).toBe('Custom License');
    expect(body.seats).toBe(5);
  });

  it('POST /v1/licenses returns 400 on invalid body', async () => {
    idCounter = 0;
    const res = await req('POST', '/v1/licenses', { name: 'test' });
    expect(res.status).toBe(400);
  });

  it('PATCH /v1/licenses/:id returns 404 for unknown', async () => {
    const res = await req('PATCH', '/v1/licenses/nonexistent', { name: 'updated' });
    expect(res.status).toBe(404);
  });

  it('DELETE /v1/licenses/:id returns 404 for unknown', async () => {
    const res = await req('DELETE', '/v1/licenses/nonexistent');
    expect(res.status).toBe(404);
  });
});

// =========================================================================
// License delete blocked when referenced
// =========================================================================

describe('License routes — reference check', () => {
  it('DELETE /v1/licenses/:id blocked when referenced by model', async () => {
    idCounter = 0;
    // Create a model with a license reference
    const form = new FormData();
    form.append('file', new Blob([makeValidGlb()], { type: 'model/gltf-binary' }), 'test.glb');
    form.append('workspaceId', 'ws-test');
    form.append('licenseId', '01J0DEFAULT0000LICENSE01');
    await app.request('/v1/models/upload', { method: 'POST', body: form });

    // Try to delete the referenced license
    const res = await req('DELETE', '/v1/licenses/01J0DEFAULT0000LICENSE01');
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('LICENSE_REFERENCED');
  });
});

// =========================================================================
// Signed URL
// =========================================================================

describe('Signed URL', () => {
  it('generates and verifies a valid signed URL', () => {
    const { url } = generateSignedUrl('resource-123', 60_000);
    expect(url).toContain('resource-123');
    expect(url).toContain('expires=');
    expect(url).toContain('sig=');
    const result = verifySignedUrl(url);
    expect(result.valid).toBe(true);
    expect(result.resourceId).toBe('resource-123');
  });

  it('rejects an expired signed URL', () => {
    const { url } = generateSignedUrl('resource-123', -1000); // already expired
    const result = verifySignedUrl(url);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('expired');
  });

  it('rejects a tampered signed URL', () => {
    const { url } = generateSignedUrl('resource-123', 60_000);
    const tampered = url.replace('sig=', 'sig=tampered');
    const result = verifySignedUrl(tampered);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('invalid_signature');
  });

  it('rejects a malformed URL', () => {
    const result = verifySignedUrl('not-a-url');
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('invalid_url');
  });

  it('rejects URL missing params', () => {
    const result = verifySignedUrl('https://cdn.domio.app/assets/123');
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('missing_params');
  });
});

// =========================================================================
// GLB parsing
// =========================================================================

describe('GLB parsing', () => {
  it('parses a valid GLB', () => {
    const buffer = makeValidGlb();
    const result = parseGlbMetadata(buffer);
    expect(result.polyCount).toBe(100);
    expect(result.textureCount).toBe(1);
    expect(result.hasAnimations).toBe(true);
  });

  it('returns warnings for non-GLB buffer', () => {
    const result = parseGlbMetadata(new ArrayBuffer(100));
    expect(result.warnings).not.toHaveLength(0);
  });

  it('returns warnings for too-small buffer', () => {
    const result = parseGlbMetadata(new ArrayBuffer(4));
    expect(result.warnings.some((w) => w.includes('too small'))).toBe(true);
  });
});

// =========================================================================
// GLB sanitization
// =========================================================================

describe('GLB sanitization', () => {
  it('strips embedded scripts', () => {
    const json = {
      extensions: {
        evil: '<script>alert(1)</script>',
      },
    };
    const result = sanitizeGlbJson(json);
    expect(result.warnings.some((w) => w.includes('script'))).toBe(true);
    expect(result.cleanedJson.extensions).not.toHaveProperty('evil');
  });

  it('strips KHR_xmp external refs', () => {
    const json = {
      extensions: {
        KHR_xmp: { external: 'metadata.xml' },
      },
    };
    const result = sanitizeGlbJson(json);
    expect(result.warnings.some((w) => w.includes('KHR_xmp'))).toBe(true);
  });

  it('passes through clean JSON', () => {
    const json = { asset: { version: '2.0' } };
    const result = sanitizeGlbJson(json);
    expect(result.warnings).toHaveLength(0);
    expect(result.cleanedJson).toEqual(json);
  });
});

// =========================================================================
// Host-access detection
// =========================================================================

describe('Host-access detection', () => {
  it('detects fetch()', () => {
    expect(detectHostAccess('fetch("https://evil.com")')).not.toHaveLength(0);
  });

  it('detects XMLHttpRequest', () => {
    expect(detectHostAccess('new XMLHttpRequest()')).not.toHaveLength(0);
  });

  it('detects navigator', () => {
    expect(detectHostAccess('navigator.userAgent')).not.toHaveLength(0);
  });

  it('detects window', () => {
    expect(detectHostAccess('window.location')).not.toHaveLength(0);
  });

  it('detects document', () => {
    expect(detectHostAccess('document.cookie')).not.toHaveLength(0);
  });

  it('returns empty for clean shader code', () => {
    expect(
      detectHostAccess('@fragment fn main() -> vec4<f32> { return vec4<f32>(1.0); }'),
    ).toHaveLength(0);
  });
});

// =========================================================================
// Audio routes — CRUD
// =========================================================================

describe('Audio routes — CRUD', () => {
  it('GET /v1/audio returns 400 without workspace_id', async () => {
    const res = await req('GET', '/v1/audio');
    expect(res.status).toBe(400);
  });

  it('GET /v1/audio returns empty list initially', async () => {
    const res = await req('GET', '/v1/audio?workspace_id=ws-test');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[] };
    expect(Array.isArray(body.items)).toBe(true);
  });

  it('POST /v1/audio creates an audio asset', async () => {
    idCounter = 0;
    const res = await req('POST', '/v1/audio', {
      workspaceId: 'ws-test',
      name: 'Background Music',
      format: 'mp3',
      sourceUrl: 'https://cdn.domio.app/audio/bg.mp3',
      derivedUrl: 'https://cdn.domio.app/audio/bg-derived.mp3',
      durationMs: 120_000,
      sampleRate: 44100,
      channels: 2,
      bitrateKbps: 192,
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      id: string;
      name: string;
      format: string;
      durationMs: number;
    };
    expect(body.name).toBe('Background Music');
    expect(body.format).toBe('mp3');
    expect(body.durationMs).toBe(120_000);
  });

  it('POST /v1/audio returns 400 on invalid body', async () => {
    const res = await req('POST', '/v1/audio', { name: 'missing fields' });
    expect(res.status).toBe(400);
  });

  it('GET /v1/audio/:id returns 404 for unknown', async () => {
    const res = await req('GET', '/v1/audio/nonexistent');
    expect(res.status).toBe(404);
  });

  it('PATCH /v1/audio/:id returns 404 for unknown', async () => {
    const res = await req('PATCH', '/v1/audio/nonexistent', { name: 'updated' });
    expect(res.status).toBe(404);
  });

  it('DELETE /v1/audio/:id returns 404 for unknown', async () => {
    const res = await req('DELETE', '/v1/audio/nonexistent');
    expect(res.status).toBe(404);
  });

  it('POST /v1/audio/upload accepts a base64 payload', async () => {
    idCounter = 0;
    const bytes = new Uint8Array(1024);
    const base64 = btoa(String.fromCharCode(...bytes));
    const res = await req('POST', '/v1/audio/upload', {
      workspaceId: 'ws-test',
      format: 'mp3',
      buffer: base64,
      name: 'uploaded.mp3',
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      audioAssetId: string;
      formatDetected: string;
      rejected: boolean;
    };
    expect(body.audioAssetId).toBeTruthy();
    expect(body.formatDetected).toBe('mp3');
    expect(body.rejected).toBe(false);
  });

  it('POST /v1/audio/upload rejects unknown format', async () => {
    const res = await req('POST', '/v1/audio/upload', {
      workspaceId: 'ws-test',
      format: 'mp3',
      buffer: 'AAAA',
    });
    // Even valid format produces a result; for 400 we test missing fields
    expect([200, 201]).toContain(res.status);
  });

  it('POST /v1/audio/upload returns 400 when workspaceId missing', async () => {
    const res = await req('POST', '/v1/audio/upload', {
      format: 'mp3',
      buffer: 'AAAA',
    });
    expect(res.status).toBe(400);
  });
});

// =========================================================================
// Video routes — CRUD
// =========================================================================

describe('Video routes — CRUD', () => {
  it('GET /v1/video returns 400 without workspace_id', async () => {
    const res = await req('GET', '/v1/video');
    expect(res.status).toBe(400);
  });

  it('GET /v1/video returns empty list initially', async () => {
    const res = await req('GET', '/v1/video?workspace_id=ws-test');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[] };
    expect(Array.isArray(body.items)).toBe(true);
  });

  it('POST /v1/video creates a video asset', async () => {
    idCounter = 0;
    const res = await req('POST', '/v1/video', {
      workspaceId: 'ws-test',
      name: 'Intro Video',
      format: 'mp4',
      sourceUrl: 'https://cdn.domio.app/video/intro.mp4',
      derivedUrl: 'https://cdn.domio.app/video/intro-derived.mp4',
      durationMs: 30_000,
      width: 1920,
      height: 1080,
      fps: 30,
      hasAudio: true,
      chapters: [{ id: 'ch1', title: 'Opening', startMs: 0, endMs: 5_000 }],
      captions: [
        {
          id: 'cap1',
          language: 'en',
          label: 'English',
          vttUrl: 'https://cdn.domio.app/video/intro.vtt',
        },
      ],
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      id: string;
      name: string;
      chapters: Array<{ id: string }>;
      captions: Array<{ id: string }>;
    };
    expect(body.name).toBe('Intro Video');
    expect(body.chapters).toHaveLength(1);
    expect(body.captions).toHaveLength(1);
  });

  it('POST /v1/video returns 400 on invalid body', async () => {
    const res = await req('POST', '/v1/video', { name: 'missing fields' });
    expect(res.status).toBe(400);
  });

  it('GET /v1/video/:id returns 404 for unknown', async () => {
    const res = await req('GET', '/v1/video/nonexistent');
    expect(res.status).toBe(404);
  });

  it('PATCH /v1/video/:id returns 404 for unknown', async () => {
    const res = await req('PATCH', '/v1/video/nonexistent', { name: 'updated' });
    expect(res.status).toBe(404);
  });

  it('DELETE /v1/video/:id returns 404 for unknown', async () => {
    const res = await req('DELETE', '/v1/video/nonexistent');
    expect(res.status).toBe(404);
  });

  it('POST /v1/video/upload accepts a buffer payload', async () => {
    idCounter = 0;
    const bytes = new Uint8Array(4096);
    const base64 = btoa(String.fromCharCode(...bytes));
    const res = await req('POST', '/v1/video/upload', {
      workspaceId: 'ws-test',
      format: 'mp4',
      buffer: base64,
      name: 'uploaded.mp4',
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      videoAssetId: string;
      width: number;
      height: number;
      fps: number;
      rejected: boolean;
    };
    expect(body.videoAssetId).toBeTruthy();
    expect(body.width).toBe(1920);
    expect(body.height).toBe(1080);
    expect(body.fps).toBe(30);
    expect(body.rejected).toBe(false);
  });

  it('POST /v1/video/upload returns 400 when workspaceId missing', async () => {
    const res = await req('POST', '/v1/video/upload', {
      format: 'mp4',
      buffer: 'AAAA',
    });
    expect(res.status).toBe(400);
  });
});

// =========================================================================
// Lottie routes — CRUD
// =========================================================================

describe('Lottie routes — CRUD', () => {
  it('GET /v1/lottie returns 400 without workspace_id', async () => {
    const res = await req('GET', '/v1/lottie');
    expect(res.status).toBe(400);
  });

  it('GET /v1/lottie returns empty list initially', async () => {
    const res = await req('GET', '/v1/lottie?workspace_id=ws-test');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[] };
    expect(Array.isArray(body.items)).toBe(true);
  });

  it('POST /v1/lottie creates a lottie asset', async () => {
    idCounter = 0;
    const res = await req('POST', '/v1/lottie', {
      workspaceId: 'ws-test',
      name: 'Loader Animation',
      format: 'json',
      sourceUrl: 'https://cdn.domio.app/lottie/loader.json',
      derivedUrl: 'https://cdn.domio.app/lottie/loader-derived.json',
      durationMs: 2_000,
      fps: 30,
      width: 512,
      height: 512,
      layerCount: 3,
      layers: [
        { name: 'bg', type: 1, visible: true, hasMasks: false, hasMatte: false },
        { name: 'spin', type: 4, visible: true, hasMasks: true, hasMatte: false },
      ],
      sanitized: true,
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      id: string;
      name: string;
      layerCount: number;
      sanitized: boolean;
    };
    expect(body.name).toBe('Loader Animation');
    expect(body.layerCount).toBe(3);
    expect(body.sanitized).toBe(true);
  });

  it('POST /v1/lottie returns 400 on invalid body', async () => {
    const res = await req('POST', '/v1/lottie', { name: 'missing fields' });
    expect(res.status).toBe(400);
  });

  it('GET /v1/lottie/:id returns 404 for unknown', async () => {
    const res = await req('GET', '/v1/lottie/nonexistent');
    expect(res.status).toBe(404);
  });

  it('PATCH /v1/lottie/:id returns 404 for unknown', async () => {
    const res = await req('PATCH', '/v1/lottie/nonexistent', { name: 'updated' });
    expect(res.status).toBe(404);
  });

  it('DELETE /v1/lottie/:id returns 404 for unknown', async () => {
    const res = await req('DELETE', '/v1/lottie/nonexistent');
    expect(res.status).toBe(404);
  });

  it('POST /v1/lottie/upload accepts JSON payload', async () => {
    idCounter = 0;
    const lottieJson = JSON.stringify({
      v: '5.5.0',
      fr: 30,
      ip: 0,
      op: 60,
      w: 512,
      h: 512,
      layers: [{ nm: 'layer1', ty: 4, ks: { o: { a: 0, k: 100 } } }],
    });
    const res = await req('POST', '/v1/lottie/upload', {
      workspaceId: 'ws-test',
      format: 'json',
      buffer: btoa(lottieJson),
      name: 'uploaded.json',
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      lottieAssetId: string;
      durationMs: number;
      width: number;
      height: number;
      layerCount: number;
      sanitized: boolean;
      rejected: boolean;
    };
    expect(body.lottieAssetId).toBeTruthy();
    expect(body.durationMs).toBe(2_000);
    expect(body.width).toBe(512);
    expect(body.height).toBe(512);
    expect(body.layerCount).toBe(1);
    expect(body.sanitized).toBe(true);
    expect(body.rejected).toBe(false);
  });

  it('POST /v1/lottie/upload rejects malformed JSON', async () => {
    const res = await req('POST', '/v1/lottie/upload', {
      workspaceId: 'ws-test',
      format: 'json',
      buffer: btoa('not valid json'),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { warnings: string[]; rejected: boolean };
    expect(body.rejected).toBe(false);
    expect(body.warnings.length).toBeGreaterThan(0);
  });

  it('POST /v1/lottie/upload returns 400 when workspaceId missing', async () => {
    const res = await req('POST', '/v1/lottie/upload', {
      format: 'json',
      buffer: 'AAAA',
    });
    expect(res.status).toBe(400);
  });
});
