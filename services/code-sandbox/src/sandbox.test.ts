/**
 * Code Sandbox — comprehensive tests.
 *
 * Tests:
 *   - Policy CRUD + validation
 *   - Code execution: stdout capture, syntax errors, capability enforcement
 *   - CPU/memory/stdout caps
 *   - Unknown policy 404
 *   - Route integration via app.request()
 */

import { describe, it, expect, beforeAll } from 'vitest';
import type { Hono } from 'hono';
import { SandboxPolicyService } from './policies.js';
import { InMemoryPolicyRepository, POLICY_DEFAULTS } from './repo.js';
import type { SandboxPolicy } from './repo.js';
import { runSandboxCode, getRunnerInfo } from './runner.js';
import { createSandboxRoutes } from './routes.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const WORKSPACE = 'ws-test-001';
const CLOCK_START = new Date('2025-01-15T00:00:00Z');

function makeClock() {
  return () => new Date(CLOCK_START.getTime());
}

function makeNumberClock() {
  return () => CLOCK_START.getTime();
}

function makePolicyService() {
  const repo = new InMemoryPolicyRepository();
  const svc = new SandboxPolicyService({
    repo,
    idGenerator: () => `P${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    clock: makeClock(),
  });
  return { repo, svc };
}

async function createTestPolicy(
  svc: SandboxPolicyService,
  overrides: Partial<SandboxPolicy> = {},
): Promise<SandboxPolicy> {
  const result = await svc.createPolicy({
    workspaceId: WORKSPACE,
    name: 'Test Policy',
    ...overrides,
  });
  return result.policy;
}

function makeApp(svc: SandboxPolicyService): Hono {
  return createSandboxRoutes({ policyService: svc });
}

// ---------------------------------------------------------------------------
// Runner info
// ---------------------------------------------------------------------------

describe('runner info', () => {
  it('reports which engine is available', async () => {
    const info = await getRunnerInfo();
    expect(info.engine).toMatch(/^(quickjs|fallback)$/);
    if (info.engine === 'fallback') {
      expect(info.reason).toBeDefined();
    }
  });
});

// =========================================================================
// Policy CRUD + validation
// =========================================================================

describe('policy CRUD', () => {
  it('creates a policy with defaults', async () => {
    const { svc } = makePolicyService();
    const result = await svc.createPolicy({
      workspaceId: WORKSPACE,
      name: 'Default Policy',
    });
    expect(result.validation.valid).toBe(true);
    const p = result.policy;
    expect(p.id).toBeDefined();
    expect(p.name).toBe('Default Policy');
    expect(p.workspaceId).toBe(WORKSPACE);
    expect(p.maxCpuMs).toBe(POLICY_DEFAULTS.maxCpuMs);
    expect(p.maxMemoryMb).toBe(POLICY_DEFAULTS.maxMemoryMb);
    expect(p.allowNetwork).toBe(false);
    expect(p.allowDom).toBe(false);
    expect(p.allowConsole).toBe(true);
    expect(p.allowImport).toBe(false);
    expect(p.moduleAllowlist).toEqual([]);
    expect(p.schemaVersion).toBe('1.0.0');
    expect(p.createdAt).toBeDefined();
  });

  it('creates a policy with custom values', async () => {
    const { svc } = makePolicyService();
    const result = await svc.createPolicy({
      workspaceId: WORKSPACE,
      name: 'Custom Policy',
      maxCpuMs: 5000,
      maxMemoryMb: 128,
      allowNetwork: true,
      allowDom: true,
      allowConsole: false,
      allowImport: true,
      moduleAllowlist: ['lodash', 'react'],
    });
    expect(result.validation.valid).toBe(true);
    const p = result.policy;
    expect(p.maxCpuMs).toBe(5000);
    expect(p.maxMemoryMb).toBe(128);
    expect(p.allowNetwork).toBe(true);
    expect(p.allowDom).toBe(true);
    expect(p.allowConsole).toBe(false);
    expect(p.allowImport).toBe(true);
    expect(p.moduleAllowlist).toEqual(['lodash', 'react']);
  });

  it('rejects invalid policy (negative maxCpuMs)', async () => {
    const { svc } = makePolicyService();
    const result = await svc.createPolicy({
      workspaceId: WORKSPACE,
      name: 'Bad Policy',
      maxCpuMs: -100,
    });
    expect(result.validation.valid).toBe(false);
  });

  it('rejects invalid policy (empty name)', async () => {
    const { svc } = makePolicyService();
    const result = await svc.createPolicy({
      workspaceId: WORKSPACE,
      name: '',
    });
    expect(result.validation.valid).toBe(false);
  });

  it('rejects invalid policy (maxMemoryMb too low)', async () => {
    const { svc } = makePolicyService();
    const result = await svc.createPolicy({
      workspaceId: WORKSPACE,
      name: 'Bad Memory',
      maxMemoryMb: 1,
    });
    expect(result.validation.valid).toBe(false);
  });

  it('gets a policy by id', async () => {
    const { svc } = makePolicyService();
    const p = await createTestPolicy(svc);
    const fetched = await svc.getPolicy(p.id);
    expect(fetched.id).toBe(p.id);
    expect(fetched.name).toBe(p.name);
  });

  it('lists policies by workspace', async () => {
    const { svc } = makePolicyService();
    await createTestPolicy(svc, { name: 'Policy A' });
    await createTestPolicy(svc, { name: 'Policy B' });
    const policies = await svc.listPolicies(WORKSPACE);
    expect(policies.length).toBe(2);
  });

  it('updates a policy', async () => {
    const { svc } = makePolicyService();
    const p = await createTestPolicy(svc);
    const result = await svc.updatePolicy(p.id, { name: 'Updated Name', maxCpuMs: 3000 });
    expect(result.validation.valid).toBe(true);
    expect(result.policy.name).toBe('Updated Name');
    expect(result.policy.maxCpuMs).toBe(3000);
  });

  it('deletes a policy', async () => {
    const { svc } = makePolicyService();
    const p = await createTestPolicy(svc);
    await svc.deletePolicy(p.id);
    await expect(svc.getPolicy(p.id)).rejects.toThrow('not found');
  });

  it('returns 404 for unknown policy', async () => {
    const { svc } = makePolicyService();
    await expect(svc.getPolicy('NONEXISTENT')).rejects.toThrow('not found');
  });
});

// =========================================================================
// Code execution — stdout capture
// =========================================================================

describe('code execution — stdout', () => {
  it('captures console.log output', async () => {
    const policy = {
      id: 'P1',
      schemaVersion: '1.0.0',
      workspaceId: 'ws',
      name: 'Test',
      maxCpuMs: 8000,
      maxMemoryMb: 64,
      allowNetwork: false,
      allowDom: false,
      allowConsole: true,
      allowImport: false,
      moduleAllowlist: [] as readonly string[],
      createdAt: new Date().toISOString(),
    };
    const result = await runSandboxCode('console.log("hello world")', policy, {
      clock: makeNumberClock(),
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('hello world');
    expect(result.killed).toBe(false);
  });

  it('captures multiple console.log outputs', async () => {
    const policy = {
      id: 'P1',
      schemaVersion: '1.0.0',
      workspaceId: 'ws',
      name: 'Test',
      maxCpuMs: 8000,
      maxMemoryMb: 64,
      allowNetwork: false,
      allowDom: false,
      allowConsole: true,
      allowImport: false,
      moduleAllowlist: [] as readonly string[],
      createdAt: new Date().toISOString(),
    };
    const result = await runSandboxCode(
      'console.log("a"); console.log("b"); console.log("c")',
      policy,
      { clock: makeNumberClock() },
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('a');
    expect(result.stdout).toContain('b');
    expect(result.stdout).toContain('c');
  });

  it('handles arithmetic correctly', async () => {
    const policy = {
      id: 'P1',
      schemaVersion: '1.0.0',
      workspaceId: 'ws',
      name: 'Test',
      maxCpuMs: 8000,
      maxMemoryMb: 64,
      allowNetwork: false,
      allowDom: false,
      allowConsole: true,
      allowImport: false,
      moduleAllowlist: [] as readonly string[],
      createdAt: new Date().toISOString(),
    };
    const result = await runSandboxCode('console.log(2 + 3 * 4)', policy, {
      clock: makeNumberClock(),
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('14');
  });
});

// =========================================================================
// Code execution — syntax errors
// =========================================================================

describe('code execution — syntax errors', () => {
  it('returns exitCode 1 with stderr on syntax error', async () => {
    const policy = {
      id: 'P1',
      schemaVersion: '1.0.0',
      workspaceId: 'ws',
      name: 'Test',
      maxCpuMs: 8000,
      maxMemoryMb: 64,
      allowNetwork: false,
      allowDom: false,
      allowConsole: true,
      allowImport: false,
      moduleAllowlist: [] as readonly string[],
      createdAt: new Date().toISOString(),
    };
    const result = await runSandboxCode('function {', policy, { clock: makeNumberClock() });
    expect(result.exitCode).toBe(1);
    expect(result.stderr.length).toBeGreaterThan(0);
  });
});

// =========================================================================
// Code execution — network capability
// =========================================================================

describe('code execution — network capability', () => {
  it('fetch is not available in sandbox by default', async () => {
    const policy = {
      id: 'P1',
      schemaVersion: '1.0.0',
      workspaceId: 'ws',
      name: 'Test',
      maxCpuMs: 8000,
      maxMemoryMb: 64,
      allowNetwork: false,
      allowDom: false,
      allowConsole: true,
      allowImport: false,
      moduleAllowlist: [] as readonly string[],
      createdAt: new Date().toISOString(),
    };
    // fetch is not defined in QuickJS sandbox — calling it directly throws
    const result = await runSandboxCode('fetch("http://example.com")', policy, {
      clock: makeNumberClock(),
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/ReferenceError|TypeError|not defined/i);
  });
});

// =========================================================================
// Code execution — DOM capability
// =========================================================================

describe('code execution — DOM capability', () => {
  it('document is not available by default', async () => {
    const policy = {
      id: 'P1',
      schemaVersion: '1.0.0',
      workspaceId: 'ws',
      name: 'Test',
      maxCpuMs: 8000,
      maxMemoryMb: 64,
      allowNetwork: false,
      allowDom: false,
      allowConsole: true,
      allowImport: false,
      moduleAllowlist: [] as readonly string[],
      createdAt: new Date().toISOString(),
    };
    // document is not defined in QuickJS sandbox by default
    const result = await runSandboxCode('document.createElement("div")', policy, {
      clock: makeNumberClock(),
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/ReferenceError|TypeError|not defined/i);
  });
});

// =========================================================================
// Code execution — CPU cap
// =========================================================================

describe('code execution — CPU cap', () => {
  it('kills infinite loop with CPU budget', async () => {
    const policy = {
      id: 'P1',
      schemaVersion: '1.0.0',
      workspaceId: 'ws',
      name: 'Test',
      maxCpuMs: 100,
      maxMemoryMb: 64,
      allowNetwork: false,
      allowDom: false,
      allowConsole: true,
      allowImport: false,
      moduleAllowlist: [] as readonly string[],
      createdAt: new Date().toISOString(),
    };
    // Use a clock that advances in real time so the interrupt handler fires
    const result = await runSandboxCode('while(true) {}', policy, { clock: () => Date.now() });
    expect(result.killed).toBe(true);
    expect(result.killedReason).toBe('cpu');
    expect(result.exitCode).toBe(137);
  }, 10000);
});

// =========================================================================
// Code execution — stdout cap
// =========================================================================

describe('code execution — stdout cap', () => {
  it('truncates stdout at 1MB', async () => {
    const policy = {
      id: 'P1',
      schemaVersion: '1.0.0',
      workspaceId: 'ws',
      name: 'Test',
      maxCpuMs: 30000,
      maxMemoryMb: 64,
      allowNetwork: false,
      allowDom: false,
      allowConsole: true,
      allowImport: false,
      moduleAllowlist: [] as readonly string[],
      createdAt: new Date().toISOString(),
    };
    // Generate ~2MB of output
    const code = 'for(let i=0; i<200000; i++) console.log("x".repeat(10))';
    const result = await runSandboxCode(code, policy, { clock: makeNumberClock() });
    // The stdout should be capped
    expect(Buffer.byteLength(result.stdout, 'utf-8')).toBeLessThanOrEqual(1.2 * 1024 * 1024); // some margin
  }, 30000);
});

// =========================================================================
// Route integration tests
// =========================================================================

describe('route integration', () => {
  let app: Hono;
  let svc: SandboxPolicyService;

  beforeAll(() => {
    const { svc: service } = makePolicyService();
    svc = service;
    app = makeApp(svc);
  });

  // Policy CRUD routes

  it('POST /v1/sandbox_policies creates a policy', async () => {
    const res = await app.request('/v1/sandbox_policies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId: WORKSPACE, name: 'Route Policy' }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.name).toBe('Route Policy');
    expect(body.id).toBeDefined();
  });

  it('POST /v1/sandbox_policies returns 400 on invalid body', async () => {
    const res = await app.request('/v1/sandbox_policies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId: WORKSPACE }), // missing name
    });
    expect(res.status).toBe(400);
  });

  it('GET /v1/sandbox_policies lists policies', async () => {
    await createTestPolicy(svc, { name: 'List Test' });
    const res = await app.request(`/v1/sandbox_policies?workspace_id=${WORKSPACE}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[] };
    expect(body.items.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /v1/sandbox_policies without workspace_id returns 400', async () => {
    const res = await app.request('/v1/sandbox_policies');
    expect(res.status).toBe(400);
  });

  it('GET /v1/sandbox_policies/:id returns a policy', async () => {
    const p = await createTestPolicy(svc, { name: 'Get Test' });
    const res = await app.request(`/v1/sandbox_policies/${p.id}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.id).toBe(p.id);
  });

  it('GET /v1/sandbox_policies/:id returns 404 for unknown', async () => {
    const res = await app.request('/v1/sandbox_policies/NONEXISTENT');
    expect(res.status).toBe(404);
  });

  it('PUT /v1/sandbox_policies/:id updates a policy', async () => {
    const p = await createTestPolicy(svc, { name: 'Update Test' });
    const res = await app.request(`/v1/sandbox_policies/${p.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Updated Name' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.name).toBe('Updated Name');
  });

  it('DELETE /v1/sandbox_policies/:id deletes a policy', async () => {
    const p = await createTestPolicy(svc, { name: 'Delete Test' });
    const res = await app.request(`/v1/sandbox_policies/${p.id}`, { method: 'DELETE' });
    expect(res.status).toBe(204);
  });

  it('DELETE /v1/sandbox_policies/:id returns 404 for unknown', async () => {
    const res = await app.request('/v1/sandbox_policies/NONEXISTENT', { method: 'DELETE' });
    expect(res.status).toBe(404);
  });

  // Run endpoint

  it('POST /v1/sandbox/run executes code', async () => {
    const p = await createTestPolicy(svc, { name: 'Run Test' });
    const res = await app.request('/v1/sandbox/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ policyId: p.id, code: 'console.log(42)' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.exitCode).toBe(0);
    expect(body.stdout).toContain('42');
    expect(body.killed).toBe(false);
  });

  it('POST /v1/sandbox/run returns 404 for unknown policy', async () => {
    const res = await app.request('/v1/sandbox/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ policyId: 'NONEXISTENT', code: 'console.log(1)' }),
    });
    expect(res.status).toBe(404);
  });

  it('POST /v1/sandbox/run returns 400 on invalid body', async () => {
    const res = await app.request('/v1/sandbox/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ policyId: 'test' }), // missing code
    });
    expect(res.status).toBe(400);
  });

  it('POST /v1/sandbox/run handles syntax error', async () => {
    const p = await createTestPolicy(svc, { name: 'Syntax Test' });
    const res = await app.request('/v1/sandbox/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ policyId: p.id, code: 'function {' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.exitCode).toBe(1);
    expect((body.stderr as string).length).toBeGreaterThan(0);
  });
});
