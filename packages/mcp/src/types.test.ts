/**
 * @domio/mcp — Capability-gate tests.
 */

import { describe, it, expect } from 'vitest';
import {
  assertCapability,
  gatedHandler,
  createGatedMcpRegistry,
  type GatedMcpRegistry,
} from './types.js';
import type { Capability, McpContext, McpTool } from '@domio/agent-schema';

const ctxWith = (claims: Capability[]): McpContext => ({
  agentId: 'agent-1',
  tenantId: 'ws_1',
  claims,
});

describe('assertCapability', () => {
  it('allows when the claim is present (array)', () => {
    const decision = assertCapability(['models:read'] as Capability[], 'models:read');
    expect(decision.allowed).toBe(true);
  });

  it('allows when the claim is present (Set)', () => {
    const set = new Set<Capability>(['models:read']);
    const decision = assertCapability(set, 'models:read');
    expect(decision.allowed).toBe(true);
  });

  it('denies with MISSING_CLAIM when absent', () => {
    const decision = assertCapability([], 'video:write');
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.code).toBe('MISSING_CLAIM');
      expect(decision.reason).toContain('video:write');
    }
  });
});

describe('gatedHandler', () => {
  const baseTool: McpTool<{ x: number }, { y: number }> = {
    name: 'echo',
    description: 'echo a number',
    capability: 'manage_scenes',
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    handler: async (_ctx, input) => ({ y: input.x * 2 }),
  };

  it('runs the handler when the claim is present', async () => {
    const gated = gatedHandler(baseTool);
    const out = await gated.handler(ctxWith(['manage_scenes']), { x: 3 });
    expect(out).toEqual({ y: 6 });
  });

  it('throws PERMISSION_DENIED when the claim is missing', async () => {
    const gated = gatedHandler(baseTool);
    await expect(gated.handler(ctxWith([]), { x: 3 })).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
    });
  });
});

describe('createGatedMcpRegistry', () => {
  let registry: GatedMcpRegistry;

  function toolWithCap(name: string, cap: Capability): McpTool<unknown, unknown> {
    return {
      name,
      description: name,
      capability: cap,
      inputSchema: {},
      outputSchema: {},
      handler: async () => ({ ok: true, name }),
    };
  }

  it('registers, lists, and gets tools', () => {
    registry = createGatedMcpRegistry();
    registry.register(toolWithCap('asset.create', 'manage_assets'));
    registry.register(toolWithCap('model.read', 'models:read'));
    expect(registry.list()).toEqual(['asset.create', 'model.read']);
    expect(registry.get('asset.create')?.capability).toBe('manage_assets');
  });

  it('calls a tool when the claim is present', async () => {
    registry = createGatedMcpRegistry();
    registry.register(toolWithCap('model.read', 'models:read'));
    const out = await registry.call('model.read', ctxWith(['models:read']), null);
    expect(out).toEqual({ ok: true, name: 'model.read' });
  });

  it('returns PERMISSION_DENIED when the claim is missing', async () => {
    registry = createGatedMcpRegistry();
    registry.register(toolWithCap('model.read', 'models:read'));
    await expect(
      registry.call('model.read', ctxWith([]), null),
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  });

  it('returns NOT_FOUND for an unregistered tool', async () => {
    registry = createGatedMcpRegistry();
    await expect(
      registry.call('missing', ctxWith(['models:read']), null),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('Phase 11 gates: 3D, media, embed, code, latex, map each gated', async () => {
    registry = createGatedMcpRegistry();
    registry.register(toolWithCap('scene.update', 'manage_scenes'));
    registry.register(toolWithCap('video.upload', 'video:write'));
    registry.register(toolWithCap('audio.upload', 'audio:write'));
    registry.register(toolWithCap('embed.policy.write', 'embed-policies:write'));
    registry.register(toolWithCap('sandbox.run', 'sandbox:run'));
    registry.register(toolWithCap('latex.render', 'latex:render'));
    registry.register(toolWithCap('map.style.write', 'map-styles:write'));

    // All allowed.
    await registry.call('scene.update', ctxWith(['manage_scenes']), null);
    await registry.call('video.upload', ctxWith(['video:write']), null);
    await registry.call('audio.upload', ctxWith(['audio:write']), null);
    await registry.call('embed.policy.write', ctxWith(['embed-policies:write']), null);
    await registry.call('sandbox.run', ctxWith(['sandbox:run']), null);
    await registry.call('latex.render', ctxWith(['latex:render']), null);
    await registry.call('map.style.write', ctxWith(['map-styles:write']), null);

    // Wrong claim → denied.
    await expect(
      registry.call('scene.update', ctxWith(['video:write']), null),
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  });
});