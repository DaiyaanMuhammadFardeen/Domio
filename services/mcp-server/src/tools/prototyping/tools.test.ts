import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { McpContext, McpTool } from '@domio/agent-schema';
import { create_hotspot, validateHotspotCreate, validateHotspotUpdate } from './hotspots.js';
import { create_overlay, list_overlays, validateOverlayCreate } from './overlays.js';
import { set_state_machine, transition_state } from './state-machines.js';
import { create_variable, set_variable } from './variables.js';
import { create_rule, list_rules, test_rule } from './rules.js';
import { create_binding, list_bindings } from './bindings.js';
import { create_form, submit_form } from './forms.js';
import { create_calculator, compute_calculator } from './calculators.js';
import { create_device_frame } from './device-frames.js';
import { create_quiz, submit_answer } from './quizzes.js';
import { create_sequence, start_sequence } from './sequences.js';
import { shorten_deep_link, resolve_deep_link } from './deep-links.js';
import { nl_patch_tool, nlDecompose, nlPatch } from './nl-patch.js';
import { simulate_sweep, sweep } from './simulate.js';
import { deck_diff, diffDecks } from './diff.js';
import { globalAuditTrail, MCPError } from './types.js';
import { grantCapability, resetRouter } from '../../router.js';

const ctx: McpContext = { agentId: 'agent-1', tenantId: 'tenant-1' };
const deniedCtx: McpContext = { agentId: 'no-perms', tenantId: 'tenant-1' };

// Loosen handlers to accept unknown inputs (the runtime validates).
type AnyTool = McpTool<unknown, unknown>;
function asAny<I, O>(tool: McpTool<I, O>): AnyTool {
  return tool as unknown as AnyTool;
}

function mockFetchOnce(body: unknown, status = 200) {
  return vi.fn().mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response);
}

function setupGlobalFetch(body: unknown, status = 200) {
  const fn = mockFetchOnce(body, status);
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

beforeEach(() => {
  resetRouter();
  globalAuditTrail.clear();
  grantCapability('agent-1', 'hotspots:write');
  grantCapability('agent-1', 'hotspots:read');
  grantCapability('agent-1', 'overlays:write');
  grantCapability('agent-1', 'overlays:read');
  grantCapability('agent-1', 'state-machines:write');
  grantCapability('agent-1', 'state-machines:read');
  grantCapability('agent-1', 'variables:write');
  grantCapability('agent-1', 'variables:read');
  grantCapability('agent-1', 'rules:write');
  grantCapability('agent-1', 'rules:read');
  grantCapability('agent-1', 'bindings:write');
  grantCapability('agent-1', 'bindings:read');
  grantCapability('agent-1', 'forms:write');
  grantCapability('agent-1', 'forms:submit');
  grantCapability('agent-1', 'forms:read');
  grantCapability('agent-1', 'calculators:write');
  grantCapability('agent-1', 'calculators:compute');
  grantCapability('agent-1', 'calculators:read');
  grantCapability('agent-1', 'device-frames:write');
  grantCapability('agent-1', 'device-frames:read');
  grantCapability('agent-1', 'quizzes:write');
  grantCapability('agent-1', 'quizzes:answer');
  grantCapability('agent-1', 'quizzes:read');
  grantCapability('agent-1', 'sequences:write');
  grantCapability('agent-1', 'sequences:read');
  grantCapability('agent-1', 'deep-links:write');
  grantCapability('agent-1', 'deep-links:read');
  grantCapability('agent-1', 'simulate');
  grantCapability('agent-1', 'deck-diff');
  grantCapability('agent-1', 'nl-patch');
  // agent-2 only gets read permissions
  grantCapability('agent-2', 'rules:read');
});

describe('invalid inputs', () => {
  it('rejects create_hotspot with missing rect', async () => {
    await expect(
      asAny(create_hotspot).handler(ctx, {
        deckId: 'd1',
        slideId: 's1',
        kind: 'cta',
        rect: { x: 1, y: 1, w: 1 },
      }),
    ).rejects.toThrow(/INVALID_INPUT/);
  });
  it('rejects create_hotspot with bad kind', async () => {
    await expect(
      asAny(create_hotspot).handler(ctx, {
        deckId: 'd1',
        slideId: 's1',
        kind: 'bogus',
        rect: { x: 1, y: 1, w: 1, h: 1 },
      }),
    ).rejects.toThrow(/INVALID_INPUT/);
  });
  it('rejects create_overlay with bad kind', async () => {
    await expect(
      asAny(create_overlay).handler(ctx, { deckId: 'd1', kind: 'nope', content: 'x' }),
    ).rejects.toThrow(/INVALID_INPUT/);
  });
  it('rejects create_overlay with missing content', async () => {
    await expect(
      asAny(create_overlay).handler(ctx, { deckId: 'd1', kind: 'modal' }),
    ).rejects.toThrow(/INVALID_INPUT/);
  });
  it('rejects set_state_machine without states', async () => {
    await expect(
      asAny(set_state_machine).handler(ctx, { deckId: 'd', id: 'm', initial: 'a' }),
    ).rejects.toThrow(/INVALID_INPUT/);
  });
  it('rejects transition_state without from', async () => {
    await expect(
      asAny(transition_state).handler(ctx, { deckId: 'd', machineId: 'm', event: 'e' }),
    ).rejects.toThrow(/INVALID_INPUT/);
  });
  it('rejects create_variable with bad type', async () => {
    await expect(
      asAny(create_variable).handler(ctx, { deckId: 'd', name: 'n', type: 'banana', default: 1 }),
    ).rejects.toThrow(/INVALID_INPUT/);
  });
  it('rejects set_variable with bad value type', async () => {
    await expect(
      asAny(set_variable).handler(ctx, { deckId: 'd', name: 'n', value: { obj: true } }),
    ).rejects.toThrow(/INVALID_INPUT/);
  });
  it('rejects create_rule without then', async () => {
    await expect(asAny(create_rule).handler(ctx, { deckId: 'd', when: 'true' })).rejects.toThrow(
      /INVALID_INPUT/,
    );
  });
  it('rejects test_rule without context', async () => {
    await expect(asAny(test_rule).handler(ctx, { deckId: 'd', ruleId: 'r' })).rejects.toThrow(
      /INVALID_INPUT/,
    );
  });
  it('rejects create_binding without target', async () => {
    await expect(asAny(create_binding).handler(ctx, { deckId: 'd', source: 'a' })).rejects.toThrow(
      /INVALID_INPUT/,
    );
  });
  it('rejects list_bindings without deckId', async () => {
    await expect(asAny(list_bindings).handler(ctx, {} as Record<string, unknown>)).rejects.toThrow(
      /INVALID_INPUT/,
    );
  });
  it('rejects create_form without fields', async () => {
    await expect(asAny(create_form).handler(ctx, { deckId: 'd', title: 't' })).rejects.toThrow(
      /INVALID_INPUT/,
    );
  });
  it('rejects submit_form with non-object values', async () => {
    await expect(
      asAny(submit_form).handler(ctx, { deckId: 'd', formId: 'f', values: 'bad' }),
    ).rejects.toThrow(/INVALID_INPUT/);
  });
  it('rejects create_calculator without expression', async () => {
    await expect(
      asAny(create_calculator).handler(ctx, { deckId: 'd', name: 'n', inputs: [] }),
    ).rejects.toThrow(/INVALID_INPUT/);
  });
  it('rejects compute_calculator with bad values', async () => {
    await expect(
      asAny(compute_calculator).handler(ctx, { deckId: 'd', calculatorId: 'c', values: 'x' }),
    ).rejects.toThrow(/INVALID_INPUT/);
  });
  it('rejects create_device_frame with non-numeric width', async () => {
    await expect(
      asAny(create_device_frame).handler(ctx, {
        deckId: 'd',
        name: 'n',
        width: 'wide',
        height: 100,
      }),
    ).rejects.toThrow(/INVALID_INPUT/);
  });
  it('rejects create_quiz without questions', async () => {
    await expect(asAny(create_quiz).handler(ctx, { deckId: 'd', title: 't' })).rejects.toThrow(
      /INVALID_INPUT/,
    );
  });
  it('rejects submit_answer without answers', async () => {
    await expect(
      asAny(submit_answer).handler(ctx, { deckId: 'd', quizId: 'q', answers: 'bad' }),
    ).rejects.toThrow(/INVALID_INPUT/);
  });
  it('rejects create_sequence without steps', async () => {
    await expect(
      asAny(create_sequence).handler(ctx, { deckId: 'd', name: 'demo' }),
    ).rejects.toThrow(/INVALID_INPUT/);
  });
  it('rejects start_sequence without sequenceId', async () => {
    await expect(asAny(start_sequence).handler(ctx, { deckId: 'd' })).rejects.toThrow(
      /INVALID_INPUT/,
    );
  });
  it('rejects shorten_deep_link without target', async () => {
    await expect(asAny(shorten_deep_link).handler(ctx, { deckId: 'd' })).rejects.toThrow(
      /INVALID_INPUT/,
    );
  });
  it('rejects resolve_deep_link without slug', async () => {
    await expect(asAny(resolve_deep_link).handler(ctx, { deckId: 'd' })).rejects.toThrow(
      /INVALID_INPUT/,
    );
  });
});

describe('permission denied', () => {
  it('denies hotspot create for agent with no capability', async () => {
    await expect(
      asAny(create_hotspot).handler(deniedCtx, {
        deckId: 'd',
        slideId: 's',
        kind: 'cta',
        rect: { x: 0, y: 0, w: 1, h: 1 },
      }),
    ).rejects.toThrow(MCPError);
    await expect(
      asAny(create_hotspot).handler(deniedCtx, {
        deckId: 'd',
        slideId: 's',
        kind: 'cta',
        rect: { x: 0, y: 0, w: 1, h: 1 },
      }),
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  });
  it('denies overlay write', async () => {
    await expect(
      asAny(create_overlay).handler(deniedCtx, { deckId: 'd', kind: 'modal', content: 'x' }),
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  });
  it('denies rule write but allows rule read', async () => {
    await expect(
      asAny(create_rule).handler(deniedCtx, { deckId: 'd', when: 'true', then: 'noop' }),
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    const fetchMock = setupGlobalFetch([]);
    const result = await asAny(list_rules).handler(
      { ...deniedCtx, agentId: 'agent-2' },
      { deckId: 'd' },
    );
    expect(result).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('denies calculator compute', async () => {
    await expect(
      asAny(compute_calculator).handler(deniedCtx, {
        deckId: 'd',
        calculatorId: 'c',
        values: { x: 1 },
      }),
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  });
});

describe('successful calls with mocked fetch', () => {
  it('create_hotspot returns hotspot', async () => {
    const fetchMock = setupGlobalFetch({
      id: 'hs1',
      slideId: 's1',
      kind: 'cta',
      rect: { x: 0, y: 0, w: 10, h: 10 },
    });
    const out = await asAny(create_hotspot).handler(ctx, {
      deckId: 'd',
      slideId: 's1',
      kind: 'cta',
      rect: { x: 0, y: 0, w: 10, h: 10 },
    });
    expect(out).toMatchObject({ id: 'hs1' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('list_overlays calls GET and returns array', async () => {
    const fetchMock = setupGlobalFetch([{ id: 'o1', kind: 'modal', content: 'x' }]);
    const out = (await asAny(list_overlays).handler(ctx, { deckId: 'd' })) as ReadonlyArray<
      Record<string, unknown>
    >;
    expect(out.length).toBe(1);
    expect(out[0]).toMatchObject({ id: 'o1' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('create_variable POSTs and returns variable', async () => {
    const fetchMock = setupGlobalFetch({ name: 'count', type: 'number', value: 0 });
    const out = await asAny(create_variable).handler(ctx, {
      deckId: 'd',
      name: 'count',
      type: 'number',
      default: 0,
    });
    expect(out).toMatchObject({ name: 'count' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('create_calculator returns calculator', async () => {
    const fetchMock = setupGlobalFetch({
      id: 'c1',
      name: 'loan',
      inputs: [],
      expression: 'x*1.05',
    });
    const out = await asAny(create_calculator).handler(ctx, {
      deckId: 'd',
      name: 'loan',
      inputs: [{ name: 'p', type: 'number' }],
      expression: 'p*1.05',
    });
    expect(out).toMatchObject({ id: 'c1' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('shorten_deep_link returns deep link', async () => {
    const fetchMock = setupGlobalFetch({ slug: 'abc', target: 'https://x' });
    const out = await asAny(shorten_deep_link).handler(ctx, { deckId: 'd', target: 'https://x' });
    expect(out).toMatchObject({ slug: 'abc' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('resolve_deep_link returns deep link', async () => {
    const fetchMock = setupGlobalFetch({ slug: 'abc', target: 'https://x' });
    const out = await asAny(resolve_deep_link).handler(ctx, { deckId: 'd', slug: 'abc' });
    expect(out).toMatchObject({ slug: 'abc' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('validators', () => {
  it('validateHotspotCreate ok', () => {
    expect(
      validateHotspotCreate({
        deckId: 'd',
        slideId: 's',
        kind: 'cta',
        rect: { x: 1, y: 1, w: 1, h: 1 },
      }).ok,
    ).toBe(true);
  });
  it('validateHotspotUpdate ok', () => {
    expect(validateHotspotUpdate({ deckId: 'd', hotspotId: 'h', patch: { label: 'x' } }).ok).toBe(
      true,
    );
  });
  it('validateOverlayCreate rejects empty', () => {
    expect(validateOverlayCreate({ deckId: 'd', kind: 'modal' }).ok).toBe(false);
  });
});

describe('nl-patch', () => {
  it('decomposes "move hotspot foo" into update_hotspot', () => {
    const calls = nlDecompose('move hotspot named foo', 'deck-x');
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0]?.toolName).toBe('update_hotspot');
  });
  it('decomposes "add rule" into create_rule', () => {
    const calls = nlDecompose('add rule: when true', 'd');
    expect(calls.find((c) => c.toolName === 'create_rule')).toBeDefined();
  });
  it('decomposes "set variable foo to 42"', () => {
    const calls = nlDecompose('set variable foo to 42', 'd');
    expect(calls.find((c) => c.toolName === 'set_variable')).toBeDefined();
  });
  it('nl_patch_tool returns tool calls', async () => {
    const out = (await asAny(nl_patch_tool).handler(ctx, {
      deckId: 'd',
      prompt: 'add hotspot named foo',
    })) as { toolCalls: readonly unknown[] };
    expect(out.toolCalls.length).toBeGreaterThan(0);
  });
  it('nl_patch handle produces rollback plan', async () => {
    const handle = nlPatch(ctx, 'd', 'add hotspot named foo');
    expect(handle.toolCalls.length).toBeGreaterThan(0);
    expect(typeof handle.apply).toBe('function');
    expect(typeof handle.rollback).toBe('function');
  });
});

describe('simulate', () => {
  it('sweep with steps < 1 returns []', async () => {
    const out = await sweep(ctx, 'c1', 'x', 0, 10, 0);
    expect(out).toEqual([]);
  });
  it('simulate_sweep returns samples', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '{"result":1}',
      json: async () => ({ result: 1 }),
    } as unknown as Response);
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const out = (await asAny(simulate_sweep).handler(ctx, {
      deckId: 'd',
      calculatorId: 'c1',
      inputName: 'x',
      from: 0,
      to: 5,
      steps: 5,
    })) as { samples: readonly unknown[] };
    expect(out.samples.length).toBe(5);
  });
  it('simulate_sweep rejects negative steps', async () => {
    await expect(
      asAny(simulate_sweep).handler(ctx, {
        deckId: 'd',
        calculatorId: 'c',
        inputName: 'x',
        from: 0,
        to: 1,
        steps: 0,
      }),
    ).rejects.toThrow(/INVALID_INPUT/);
  });
  it('simulate_sweep rejects missing fields', async () => {
    await expect(
      asAny(simulate_sweep).handler(ctx, { deckId: 'd' } as unknown as Parameters<
        typeof simulate_sweep.handler
      >[1]),
    ).rejects.toThrow(/INVALID_INPUT/);
  });
  it('sweep caps steps at 1024', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '{"result":1}',
      json: async () => ({ result: 1 }),
    } as unknown as Response);
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const out = await sweep(ctx, 'c1', 'x', 0, 10, 5000);
    expect(out.length).toBe(1024);
  });
});

describe('diff', () => {
  it('returns empty diff for identical decks', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '[]',
      json: async () => [],
    } as unknown as Response) as unknown as typeof fetch;
    const out = await diffDecks(ctx, 'a', 'b');
    expect(out.added).toEqual([]);
    expect(out.removed).toEqual([]);
    expect(out.changed).toEqual([]);
  });
  it('returns added/removed entries', async () => {
    let n = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      n += 1;
      // Even calls are deckB; deckB has more items than deckA.
      const body = n % 2 === 0 ? [{ id: 'h1' }, { id: 'h2' }] : [{ id: 'h1' }];
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(body),
        json: async () => body,
      } as unknown as Response;
    }) as unknown as typeof fetch;
    const out = await diffDecks(ctx, 'a', 'b');
    expect(out.added.length).toBeGreaterThan(0);
  });
  it('returns removed entries when deckB is missing items', async () => {
    let n = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      n += 1;
      // Odd calls are deckA; deckA has more items than deckB.
      const body = n % 2 === 1 ? [{ id: 'h1' }, { id: 'h2' }] : [{ id: 'h1' }];
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(body),
        json: async () => body,
      } as unknown as Response;
    }) as unknown as typeof fetch;
    const out = await diffDecks(ctx, 'a', 'b');
    expect(out.removed.length).toBeGreaterThan(0);
  });
  it('returns changed entries when entity differs', async () => {
    let n = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      n += 1;
      // Both decks have h1 with different labels.
      const body = n % 2 === 1 ? [{ id: 'h1', label: 'a' }] : [{ id: 'h1', label: 'b' }];
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(body),
        json: async () => body,
      } as unknown as Response;
    }) as unknown as typeof fetch;
    const out = await diffDecks(ctx, 'a', 'b');
    expect(out.changed.length).toBeGreaterThan(0);
  });
  it('deck_diff tool returns diff', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '[]',
      json: async () => [],
    } as unknown as Response) as unknown as typeof fetch;
    const out = await asAny(deck_diff).handler(ctx, { deckIdA: 'a', deckIdB: 'b' });
    expect(out).toMatchObject({ added: [], removed: [], changed: [] });
  });
  it('deck_diff rejects missing deckId', async () => {
    await expect(asAny(deck_diff).handler(ctx, { deckIdA: 'a' })).rejects.toThrow(/INVALID_INPUT/);
  });
});
