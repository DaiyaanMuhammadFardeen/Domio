/**
 * Shader Registry — handler tests (Phase 11).
 *
 * Tests the full REST surface via app.request() against an in-memory repo.
 * Coverage: CRUD, WGSL requirement, host-access rejection, extension detection,
 * build chain (success + failure), publish flow.
 */

import { describe, it, expect } from 'vitest';
import { createApp } from '../index.js';
import { InMemoryShaderRepository, type Shader, type ShaderRepository } from '../repo.js';
import { buildShader, SAFE_DEFAULT_SHADER, type BuildDeps, type ShaderCompiler } from '../build.js';

const WS = 'ws-test-001';

function makeDeps(opts?: {
  idGenerator?: () => string;
  clock?: () => Date;
  build?: BuildDeps;
  repo?: ShaderRepository;
}) {
  return {
    repo: opts?.repo ?? new InMemoryShaderRepository(),
    idGenerator: opts?.idGenerator ?? (() => 'test-id-000000000000000'),
    clock: opts?.clock ?? (() => new Date('2025-06-15T00:00:00Z')),
    ...(opts?.build !== undefined ? { build: opts.build } : {}),
  };
}

async function createTestShader(
  repo: ShaderRepository,
  overrides?: Partial<Shader>,
): Promise<Shader> {
  const record: Shader = {
    id: 'shader-001',
    workspaceId: WS,
    authorId: 'author-001',
    name: 'Test Shader',
    kind: 'background',
    sourceWgsl: '@group(0) @binding(0) var<uniform> u_time: f32;',
    sourceGlsl: 'precision mediump float; uniform float u_time;',
    inputs: { u_time: { type: 'float', default: 0, description: 'Time uniform' } },
    published: false,
    createdAt: '2025-06-15T00:00:00.000Z',
    ...overrides,
  };
  await repo.insert(record);
  return record;
}

// =========================================================================
// CRUD operations
// =========================================================================

describe('shader registry — CRUD', () => {
  it('GET /v1/shaders?workspace_id=X returns empty list', async () => {
    const app = createApp(makeDeps());
    const res = await app.request(`/v1/shaders?workspace_id=${WS}`);
    expect(res.status).toBe(200);
    const body = await res.json() as { items: unknown[] };
    expect(body.items).toEqual([]);
  });

  it('GET /v1/shaders without workspace_id returns 400', async () => {
    const app = createApp(makeDeps());
    const res = await app.request('/v1/shaders');
    expect(res.status).toBe(400);
  });

  it('POST /v1/shaders creates a shader', async () => {
    const app = createApp(makeDeps());
    const res = await app.request('/v1/shaders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'My Shader',
        kind: 'material',
        sourceWgsl: '@fragment fn fs() -> @location(0) vec4f { return vec4f(1.0); }',
        sourceGlsl: 'precision mediump float; void main() { gl_FragColor = vec4(1.0); }',
        inputs: {},
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { id: string; name: string; kind: string; published: boolean };
    expect(body.id).toBeDefined();
    expect(body.name).toBe('My Shader');
    expect(body.kind).toBe('material');
    expect(body.published).toBe(false);
  });

  it('POST /v1/shaders returns 400 on invalid body', async () => {
    const app = createApp(makeDeps());
    const res = await app.request('/v1/shaders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { code: string };
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('GET /v1/shaders/:id returns the shader', async () => {
    const { repo } = makeDeps();
    const shader = await createTestShader(repo);
    const app = createApp(makeDeps({ repo }));
    const res = await app.request(`/v1/shaders/${shader.id}?workspace_id=${WS}`);
    expect(res.status).toBe(200);
    const body = await res.json() as { id: string };
    expect(body.id).toBe(shader.id);
  });

  it('GET /v1/shaders/:id returns 404 for unknown shader', async () => {
    const app = createApp(makeDeps());
    const res = await app.request(`/v1/shaders/nonexistent?workspace_id=${WS}`);
    expect(res.status).toBe(404);
  });

  it('PUT /v1/shaders/:id updates the shader', async () => {
    const { repo } = makeDeps();
    const shader = await createTestShader(repo);
    const app = createApp(makeDeps({ repo }));
    const res = await app.request(`/v1/shaders/${shader.id}?workspace_id=${WS}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Updated Shader' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { name: string };
    expect(body.name).toBe('Updated Shader');
  });

  it('PUT /v1/shaders/:id returns 404 for unknown shader', async () => {
    const app = createApp(makeDeps());
    const res = await app.request(`/v1/shaders/nonexistent?workspace_id=${WS}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Updated' }),
    });
    expect(res.status).toBe(404);
  });

  it('DELETE /v1/shaders/:id deletes the shader', async () => {
    const { repo } = makeDeps();
    const shader = await createTestShader(repo);
    const app = createApp(makeDeps({ repo }));
    const res = await app.request(`/v1/shaders/${shader.id}?workspace_id=${WS}`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(204);
    // Verify it's gone
    const getRes = await app.request(`/v1/shaders/${shader.id}?workspace_id=${WS}`);
    expect(getRes.status).toBe(404);
  });

  it('DELETE /v1/shaders/:id returns 404 for unknown shader', async () => {
    const app = createApp(makeDeps());
    const res = await app.request('/v1/shaders/nonexistent?workspace_id=ws', {
      method: 'DELETE',
    });
    expect(res.status).toBe(404);
  });

  it('GET /v1/shaders?workspace_id=X&kind=Y filters by kind', async () => {
    const { repo } = makeDeps();
    await createTestShader(repo, { id: 's1', kind: 'background', name: 'BG' });
    await createTestShader(repo, { id: 's2', kind: 'particle', name: 'Particle' });
    const app = createApp(makeDeps({ repo }));
    const res = await app.request(`/v1/shaders?workspace_id=${WS}&kind=background`);
    expect(res.status).toBe(200);
    const body = await res.json() as { items: Array<{ kind: string }> };
    expect(body.items.length).toBe(1);
    expect(body.items[0]!.kind).toBe('background');
  });
});

// =========================================================================
// WGSL requirement for background/particle
// =========================================================================

describe('shader registry — WGSL requirement', () => {
  it('POST /v1/shaders returns 400 when background kind has no wgsl_source', async () => {
    const app = createApp(makeDeps());
    const res = await app.request('/v1/shaders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Bad BG',
        kind: 'background',
        sourceWgsl: '',
        sourceGlsl: 'void main() {}',
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('WGSL source required for kind background');
  });

  it('POST /v1/shaders returns 400 when particle kind has no wgsl_source', async () => {
    const app = createApp(makeDeps());
    const res = await app.request('/v1/shaders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Bad Particle',
        kind: 'particle',
        sourceWgsl: '',
        sourceGlsl: 'void main() {}',
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('WGSL source required for kind particle');
  });

  it('POST /v1/shaders allows material kind without wgsl_source', async () => {
    const app = createApp(makeDeps());
    const res = await app.request('/v1/shaders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Material',
        kind: 'material',
        sourceWgsl: 'valid wgsl',
        sourceGlsl: 'void main() {}',
      }),
    });
    expect(res.status).toBe(201);
  });
});

// =========================================================================
// Host-environment access rejection
// =========================================================================

describe('shader registry — host-access rejection', () => {
  it('POST /v1/shaders rejects source containing fetch(', async () => {
    const app = createApp(makeDeps());
    const res = await app.request('/v1/shaders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Evil Shader',
        kind: 'material',
        sourceWgsl: 'fetch("https://evil.com")',
        sourceGlsl: 'void main() {}',
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('Host-environment access is not allowed in shaders');
  });

  it('POST /v1/shaders rejects source containing XMLHttpRequest', async () => {
    const app = createApp(makeDeps());
    const res = await app.request('/v1/shaders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Evil Shader',
        kind: 'material',
        sourceWgsl: 'var x = new XMLHttpRequest();',
        sourceGlsl: 'void main() {}',
      }),
    });
    expect(res.status).toBe(400);
  });

  it('POST /v1/shaders rejects source containing importScripts', async () => {
    const app = createApp(makeDeps());
    const res = await app.request('/v1/shaders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Evil Shader',
        kind: 'post',
        sourceWgsl: 'importScripts("evil.js");',
        sourceGlsl: 'void main() {}',
      }),
    });
    expect(res.status).toBe(400);
  });

  it('POST /v1/shaders rejects source containing process.', async () => {
    const app = createApp(makeDeps());
    const res = await app.request('/v1/shaders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Evil Shader',
        kind: 'material',
        sourceWgsl: 'valid wgsl',
        sourceGlsl: 'process.env.SECRET',
      }),
    });
    expect(res.status).toBe(400);
  });

  it('PUT /v1/shaders/:id rejects source containing fetch(', async () => {
    const { repo } = makeDeps();
    const shader = await createTestShader(repo);
    const app = createApp(makeDeps({ repo }));
    const res = await app.request(`/v1/shaders/${shader.id}?workspace_id=${WS}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceWgsl: 'fetch("https://evil.com")' }),
    });
    expect(res.status).toBe(400);
  });
});

// =========================================================================
// Extension detection + unsupported banner
// =========================================================================

describe('shader registry — extension detection', () => {
  it('detectExtensions finds GLSL extension directives', async () => {
    const { detectExtensions } = await import('../schemas.js');
    const source = '#extension GL_EXT_foo : enable\nvoid main() {}';
    const result = detectExtensions(source);
    expect(result.extensions).toContain('GL_EXT_foo');
    expect(result.unsupported).toContain('GL_EXT_foo');
  });

  it('detectExtensions recognizes known supported extensions', async () => {
    const { detectExtensions } = await import('../schemas.js');
    const source = '#extension GL_EXT_shader_texture_lod : enable\nvoid main() {}';
    const result = detectExtensions(source);
    expect(result.extensions).toContain('GL_EXT_shader_texture_lod');
    expect(result.unsupported).toEqual([]);
  });

  it('publish returns banner when unsupported extensions detected', async () => {
    const { repo } = makeDeps();
    await createTestShader(repo, {
      sourceWgsl: 'valid wgsl',
      sourceGlsl: '#extension GL_EXT_foo : enable\nvoid main() {}',
    });
    const app = createApp(makeDeps({ repo }));
    const res = await app.request(`/v1/shaders/shader-001/publish?workspace_id=${WS}`, {
      method: 'POST',
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { banner?: string; published: boolean };
    expect(body.banner).toContain('GL_EXT_foo');
    expect(body.published).toBe(true);
  });

  it('publish does not include banner when no unsupported extensions', async () => {
    const { repo } = makeDeps();
    await createTestShader(repo, {
      sourceWgsl: 'valid wgsl',
      sourceGlsl: '#extension GL_EXT_shader_texture_lod : enable\nvoid main() {}',
    });
    const app = createApp(makeDeps({ repo }));
    const res = await app.request(`/v1/shaders/shader-001/publish?workspace_id=${WS}`, {
      method: 'POST',
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { banner?: string; published: boolean };
    expect(body.banner).toBeUndefined();
    expect(body.published).toBe(true);
  });
});

// =========================================================================
// Build chain — failure → fallback + error
// =========================================================================

describe('shader registry — build failure', () => {
  it('buildShader returns fallback when source contains TODO_COMPILE_ERROR', async () => {
    const shader: Shader = {
      id: 'bad-shader',
      workspaceId: WS,
      authorId: 'a',
      name: 'Bad',
      kind: 'background',
      sourceWgsl: 'TODO_COMPILE_ERROR in source',
      sourceGlsl: '',
      inputs: {},
      published: false,
      createdAt: '2025-01-01T00:00:00Z',
    };
    const result = buildShader(shader);
    expect(result.compiled).toBe(false);
    if (!result.compiled) {
      expect(result.error).toContain('TODO_COMPILE_ERROR');
      expect(result.fallback).toBe(SAFE_DEFAULT_SHADER);
    }
  });

  it('publish returns 400 with fallback when build fails', async () => {
    const { repo } = makeDeps();
    await createTestShader(repo, {
      sourceWgsl: 'TODO_COMPILE_ERROR',
      sourceGlsl: 'valid glsl',
    });
    const app = createApp(makeDeps({ repo }));
    const res = await app.request(`/v1/shaders/shader-001/publish?workspace_id=${WS}`, {
      method: 'POST',
    });
    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect(body.compiled).toBe(false);
    expect(String(body.error)).toContain('TODO_COMPILE_ERROR');
    expect(body.fallback).toBe(SAFE_DEFAULT_SHADER);
  });
});

// =========================================================================
// Build chain — success → programKey
// =========================================================================

describe('shader registry — build success', () => {
  it('buildShader returns programKey on success', () => {
    const shader: Shader = {
      id: 'good-shader',
      workspaceId: WS,
      authorId: 'a',
      name: 'Good',
      kind: 'material',
      sourceWgsl: '@fragment fn fs() -> @location(0) vec4f { return vec4f(1.0); }',
      sourceGlsl: 'void main() {}',
      inputs: {},
      published: false,
      createdAt: '2025-01-01T00:00:00Z',
    };
    const result = buildShader(shader);
    expect(result.compiled).toBe(true);
    if (result.compiled) {
      expect(result.programKey).toBe('prog-good-shader-material');
    }
  });

  it('publish returns 200 with programKey when build succeeds', async () => {
    const { repo } = makeDeps();
    await createTestShader(repo, {
      sourceWgsl: '@fragment fn fs() -> @location(0) vec4f { return vec4f(1.0); }',
      sourceGlsl: 'valid glsl',
    });
    const app = createApp(makeDeps({ repo }));
    const res = await app.request(`/v1/shaders/shader-001/publish?workspace_id=${WS}`, {
      method: 'POST',
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { programKey: string; published: boolean };
    expect(body.programKey).toBe('prog-shader-001-background');
    expect(body.published).toBe(true);
  });

  it('custom compiler is used when provided', async () => {
    const customCompiler: ShaderCompiler = (_s) => ({ success: true, programKey: 'custom-key' });
    const { repo } = makeDeps();
    await createTestShader(repo);
    const app = createApp(makeDeps({ repo, build: { compiler: customCompiler } }));
    const res = await app.request(`/v1/shaders/shader-001/publish?workspace_id=${WS}`, {
      method: 'POST',
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { programKey: string };
    expect(body.programKey).toBe('custom-key');
  });
});

// =========================================================================
// Publish flow — draft → published
// =========================================================================

describe('shader registry — publish flow', () => {
  it('shader starts as draft (not published)', async () => {
    const { repo } = makeDeps();
    const shader = await createTestShader(repo);
    expect(shader.published).toBe(false);
  });

  it('publish marks shader as published', async () => {
    const { repo } = makeDeps();
    await createTestShader(repo);
    const app = createApp(makeDeps({ repo }));
    const res = await app.request(`/v1/shaders/shader-001/publish?workspace_id=${WS}`, {
      method: 'POST',
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { published: boolean };
    expect(body.published).toBe(true);
  });

  it('publish returns 404 for unknown shader', async () => {
    const app = createApp(makeDeps());
    const res = await app.request(`/v1/shaders/nonexistent/publish?workspace_id=${WS}`, {
      method: 'POST',
    });
    expect(res.status).toBe(404);
  });

  it('full lifecycle: create → get → update → publish → verify', async () => {
    const { repo } = makeDeps();
    const app = createApp(makeDeps({ repo }));

    // Create
    const createRes = await app.request(`/v1/shaders?workspace_id=${WS}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Lifecycle Shader',
        kind: 'material',
        sourceWgsl: '@fragment fn fs() -> @location(0) vec4f { return vec4f(1.0); }',
        sourceGlsl: 'void main() {}',
        inputs: {},
      }),
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json() as { id: string; name: string; published: boolean };
    expect(created.published).toBe(false);

    // Get
    const getRes = await app.request(`/v1/shaders/${created.id}?workspace_id=${WS}`);
    expect(getRes.status).toBe(200);

    // Update
    const updateRes = await app.request(`/v1/shaders/${created.id}?workspace_id=${WS}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Updated Lifecycle' }),
    });
    expect(updateRes.status).toBe(200);
    const updated = await updateRes.json() as { name: string };
    expect(updated.name).toBe('Updated Lifecycle');

    // Publish
    const pubRes = await app.request(`/v1/shaders/${created.id}/publish?workspace_id=${WS}`, {
      method: 'POST',
    });
    expect(pubRes.status).toBe(200);
    const published = await pubRes.json() as { published: boolean; programKey: string };
    expect(published.published).toBe(true);
    expect(published.programKey).toBeDefined();
  });

  it('publish for WGSL-required kind fails without source', async () => {
    const { repo } = makeDeps();
    await createTestShader(repo, {
      kind: 'background',
      sourceWgsl: '',
      sourceGlsl: 'void main() {}',
    });
    const app = createApp(makeDeps({ repo }));
    const res = await app.request(`/v1/shaders/shader-001/publish?workspace_id=${WS}`, {
      method: 'POST',
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('WGSL source required');
  });
});
