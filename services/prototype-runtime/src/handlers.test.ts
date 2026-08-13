/**
 * Prototype-runtime service handler tests (Phase 10 M1 + M2).
 * Exercises CRUD, validation, tenant scoping, optimistic locking,
 * expression compilation, metrics, and audit behavior.
 */

import { describe, expect, it } from 'vitest';
import type { HttpRequest } from './handlers.js';
import { handlers } from './handlers.js';
import { PrototypeRuntimeService } from './service.js';
import {
  InMemoryHotspotRepository,
  InMemoryOverlayRepository,
  InMemoryBranchingEdgeRepository,
  InMemoryInteractionStateRepository,
  InMemoryVariableRepository,
  InMemoryVariableBindingRepository,
  InMemoryConditionalRuleRepository,
  InMemoryQuizRepository,
  InMemoryQuizAttemptRepository,
  InMemoryQuizAnswerRepository,
  InMemoryQuizResultRepository,
  InMemoryLlmReviewQueueRepository,
  InMemoryPresentationSequenceRepository,
} from './dal.js';
import { PrototypeMetrics, P10_METRICS } from './metrics.js';
import { PrototypeAuditRecorder } from './audit.js';

const TENANT = 'tenant-1';
const OTHER_TENANT = 'tenant-2';
const DECK = '01H000000000000000000000D1';
const SLIDE_A = '01H000000000000000000000S1';
const SLIDE_B = '01H000000000000000000000S2';
const TARGET = '01H000000000000000000000E1';
const FIXED_TIME = 1_700_000_000_000;
let idCounter = 0;

function idGenerator(): string {
  idCounter += 1;
  return `01H000000000000000000${idCounter.toString(32).toUpperCase().padStart(3, '0')}`;
}

function makeService() {
  idCounter = 0;
  return new PrototypeRuntimeService({
    hotspots: new InMemoryHotspotRepository(),
    overlays: new InMemoryOverlayRepository(),
    branchingEdges: new InMemoryBranchingEdgeRepository(),
    interactionStates: new InMemoryInteractionStateRepository(),
    variables: new InMemoryVariableRepository(),
    variableBindings: new InMemoryVariableBindingRepository(),
    conditionalRules: new InMemoryConditionalRuleRepository(),
    quizzes: new InMemoryQuizRepository(),
    quizAttempts: new InMemoryQuizAttemptRepository(),
    quizAnswers: new InMemoryQuizAnswerRepository(),
    quizResults: new InMemoryQuizResultRepository(),
    llmReviewQueue: new InMemoryLlmReviewQueueRepository(),
    presentationSequences: new InMemoryPresentationSequenceRepository(),
    idGenerator,
    clock: () => FIXED_TIME,
  });
}

function makeCtx() {
  const service = makeService();
  const metrics = new PrototypeMetrics();
  const audit = new PrototypeAuditRecorder();
  return { service, metrics, audit, ctx: { service, metrics, audit } as const };
}

function req<P, B, Q = Record<string, string | undefined>>(
  method: string,
  path: string,
  params: P,
  body: B,
  query: Q = {} as Q,
): HttpRequest<P, B, Q> {
  return { method, path, params, body, query, headers: {} };
}

const hotspotBody = {
  slideId: SLIDE_A,
  name: 'Next',
  geometry: { kind: 'rect', x: 0.7, y: 0, w: 0.3, h: 0.1 },
  gestureMask: ['click'],
  targetType: 'slide',
  targetRef: { slideId: SLIDE_B },
};

const overlayBody = {
  slideId: SLIDE_A,
  name: 'Info',
  type: 'modal',
  sizeStrategy: 'small',
  schema: {},
};

const variableBody = {
  name: 'TIER',
  scope: 'deck',
  type: 'string',
  defaultValue: 'monthly',
  visibility: 'deck_public',
};

const edgeBody = {
  fromSlideId: SLIDE_A,
  toSlideId: SLIDE_B,
  name: 'Continue',
  priority: 0,
};

const ruleBody = {
  name: 'Annual tier',
  priority: 10,
  conditionSource: '$TIER == "annual"',
  action: { kind: 'show', params: { targetId: TARGET } },
  enabled: true,
};

// ── Hotspots ────────────────────────────────────────────────────────────

describe('hotspot handlers', () => {
  it('creates a hotspot', async () => {
    const { ctx } = makeCtx();
    const res = await handlers.createHotspot(
      req('POST', '', { deck_id: DECK }, hotspotBody, { tenant_id: TENANT }),
      ctx,
    );
    expect(res.status).toBe(201);
    expect((res.body as { deckId: string }).deckId).toBe(DECK);
  });

  it('returns 401 without tenant_id', async () => {
    const { service } = makeCtx();
    const res = await handlers.createHotspot(req('POST', '', { deck_id: DECK }, hotspotBody), {
      service,
    });
    expect(res.status).toBe(401);
  });

  it('rejects invalid create body', async () => {
    const { ctx, metrics } = makeCtx();
    const res = await handlers.createHotspot(
      req('POST', '', { deck_id: DECK }, { name: '' }, { tenant_id: TENANT }),
      ctx,
    );
    expect(res.status).toBe(400);
    expect(metrics.get(P10_METRICS.validationFailed)).toBe(1);
  });

  it('lists only the requested tenant', async () => {
    const { ctx } = makeCtx();
    await handlers.createHotspot(
      req('POST', '', { deck_id: DECK }, hotspotBody, { tenant_id: TENANT }),
      ctx,
    );
    await handlers.createHotspot(
      req('POST', '', { deck_id: DECK }, hotspotBody, { tenant_id: OTHER_TENANT }),
      ctx,
    );
    const res = await handlers.listHotspots(
      req('GET', '', { deck_id: DECK }, undefined, { tenant_id: TENANT }),
      ctx,
    );
    expect((res.body as { items: unknown[] }).items).toHaveLength(1);
  });

  it('filters by slide_id', async () => {
    const { ctx } = makeCtx();
    await handlers.createHotspot(
      req('POST', '', { deck_id: DECK }, hotspotBody, { tenant_id: TENANT }),
      ctx,
    );
    const res = await handlers.listHotspots(
      req('GET', '', { deck_id: DECK }, undefined, { tenant_id: TENANT, slide_id: SLIDE_B }),
      ctx,
    );
    expect((res.body as { items: unknown[] }).items).toHaveLength(0);
  });

  it('gets a hotspot by id', async () => {
    const { ctx } = makeCtx();
    const created = await handlers.createHotspot(
      req('POST', '', { deck_id: DECK }, hotspotBody, { tenant_id: TENANT }),
      ctx,
    );
    const id = (created.body as { id: string }).id;
    const res = await handlers.getHotspot(
      req('GET', '', { id }, undefined, { tenant_id: TENANT }),
      ctx,
    );
    expect(res.status).toBe(200);
  });

  it('returns 404 for unknown hotspot', async () => {
    const { ctx } = makeCtx();
    const res = await handlers.getHotspot(
      req('GET', '', { id: TARGET }, undefined, { tenant_id: TENANT }),
      ctx,
    );
    expect(res.status).toBe(404);
  });

  it('patches with optimistic lock', async () => {
    const { ctx } = makeCtx();
    const created = await handlers.createHotspot(
      req('POST', '', { deck_id: DECK }, hotspotBody, { tenant_id: TENANT }),
      ctx,
    );
    const id = (created.body as { id: string }).id;
    const res = await handlers.patchHotspot(
      req('PATCH', '', { id }, { version: 0, name: 'Next slide' }, { tenant_id: TENANT }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect((res.body as { version: number; name: string }).version).toBe(1);
    expect((res.body as { name: string }).name).toBe('Next slide');
  });

  it('returns 409 on stale hotspot version', async () => {
    const { ctx } = makeCtx();
    const created = await handlers.createHotspot(
      req('POST', '', { deck_id: DECK }, hotspotBody, { tenant_id: TENANT }),
      ctx,
    );
    const id = (created.body as { id: string }).id;
    await handlers.patchHotspot(
      req('PATCH', '', { id }, { version: 0, name: 'A' }, { tenant_id: TENANT }),
      ctx,
    );
    const res = await handlers.patchHotspot(
      req('PATCH', '', { id }, { version: 0, name: 'B' }, { tenant_id: TENANT }),
      ctx,
    );
    expect(res.status).toBe(409);
    expect((res.body as { currentVersion: number }).currentVersion).toBe(1);
  });

  it('deletes a hotspot', async () => {
    const { ctx } = makeCtx();
    const created = await handlers.createHotspot(
      req('POST', '', { deck_id: DECK }, hotspotBody, { tenant_id: TENANT }),
      ctx,
    );
    const id = (created.body as { id: string }).id;
    expect(
      (
        await handlers.deleteHotspot(
          req('DELETE', '', { id }, undefined, { tenant_id: TENANT }),
          ctx,
        )
      ).status,
    ).toBe(204);
  });

  it('records audit on creation', async () => {
    const { ctx, audit } = makeCtx();
    await handlers.createHotspot(
      req('POST', '', { deck_id: DECK }, hotspotBody, { tenant_id: TENANT }),
      ctx,
    );
    expect(audit.list()[0]?.action).toBe('hotspot.create');
  });
});

// ── Overlays ────────────────────────────────────────────────────────────

describe('overlay handlers', () => {
  it('creates and lists overlays', async () => {
    const { ctx } = makeCtx();
    expect(
      (
        await handlers.createOverlay(
          req('POST', '', { deck_id: DECK }, overlayBody, { tenant_id: TENANT }),
          ctx,
        )
      ).status,
    ).toBe(201);
    const list = await handlers.listOverlays(
      req('GET', '', { deck_id: DECK }, undefined, { tenant_id: TENANT }),
      ctx,
    );
    expect((list.body as { items: unknown[] }).items).toHaveLength(1);
  });

  it('rejects invalid overlay type', async () => {
    const { ctx } = makeCtx();
    const res = await handlers.createOverlay(
      req('POST', '', { deck_id: DECK }, { ...overlayBody, type: 'window' }, { tenant_id: TENANT }),
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it('gets and patches an overlay', async () => {
    const { ctx } = makeCtx();
    const created = await handlers.createOverlay(
      req('POST', '', { deck_id: DECK }, overlayBody, { tenant_id: TENANT }),
      ctx,
    );
    const id = (created.body as { id: string }).id;
    expect(
      (await handlers.getOverlay(req('GET', '', { id }, undefined, { tenant_id: TENANT }), ctx))
        .status,
    ).toBe(200);
    const patched = await handlers.patchOverlay(
      req('PATCH', '', { id }, { version: 0, persistent: true }, { tenant_id: TENANT }),
      ctx,
    );
    expect((patched.body as { persistent: boolean }).persistent).toBe(true);
  });

  it('deletes an overlay', async () => {
    const { ctx } = makeCtx();
    const created = await handlers.createOverlay(
      req('POST', '', { deck_id: DECK }, overlayBody, { tenant_id: TENANT }),
      ctx,
    );
    const id = (created.body as { id: string }).id;
    expect(
      (
        await handlers.deleteOverlay(
          req('DELETE', '', { id }, undefined, { tenant_id: TENANT }),
          ctx,
        )
      ).status,
    ).toBe(204);
  });
});

// ── Branching edges ─────────────────────────────────────────────────────

describe('branching edge handlers', () => {
  it('creates and lists branching edges', async () => {
    const { ctx } = makeCtx();
    expect(
      (
        await handlers.createBranchingEdge(
          req('POST', '', { deck_id: DECK }, edgeBody, { tenant_id: TENANT }),
          ctx,
        )
      ).status,
    ).toBe(201);
    const list = await handlers.listBranchingEdges(
      req('GET', '', { deck_id: DECK }, undefined, { tenant_id: TENANT }),
      ctx,
    );
    expect((list.body as { items: unknown[] }).items).toHaveLength(1);
  });

  it('rejects self-loops with 422', async () => {
    const { ctx } = makeCtx();
    const res = await handlers.createBranchingEdge(
      req(
        'POST',
        '',
        { deck_id: DECK },
        { ...edgeBody, toSlideId: SLIDE_A },
        { tenant_id: TENANT },
      ),
      ctx,
    );
    expect(res.status).toBe(422);
  });

  it('returns 409 for a duplicate edge', async () => {
    const { ctx } = makeCtx();
    await handlers.createBranchingEdge(
      req('POST', '', { deck_id: DECK }, edgeBody, { tenant_id: TENANT }),
      ctx,
    );
    const res = await handlers.createBranchingEdge(
      req('POST', '', { deck_id: DECK }, edgeBody, { tenant_id: TENANT }),
      ctx,
    );
    expect(res.status).toBe(409);
  });

  it('gets and patches an edge', async () => {
    const { ctx } = makeCtx();
    const created = await handlers.createBranchingEdge(
      req('POST', '', { deck_id: DECK }, edgeBody, { tenant_id: TENANT }),
      ctx,
    );
    const id = (created.body as { id: string }).id;
    expect(
      (
        await handlers.getBranchingEdge(
          req('GET', '', { id }, undefined, { tenant_id: TENANT }),
          ctx,
        )
      ).status,
    ).toBe(200);
    const patched = await handlers.patchBranchingEdge(
      req('PATCH', '', { id }, { priority: 5 }, { tenant_id: TENANT }),
      ctx,
    );
    expect((patched.body as { priority: number }).priority).toBe(5);
  });

  it('deletes an edge', async () => {
    const { ctx } = makeCtx();
    const created = await handlers.createBranchingEdge(
      req('POST', '', { deck_id: DECK }, edgeBody, { tenant_id: TENANT }),
      ctx,
    );
    const id = (created.body as { id: string }).id;
    expect(
      (
        await handlers.deleteBranchingEdge(
          req('DELETE', '', { id }, undefined, { tenant_id: TENANT }),
          ctx,
        )
      ).status,
    ).toBe(204);
  });
});

// ── Variables ───────────────────────────────────────────────────────────

describe('variable handlers', () => {
  it('creates and lists variables', async () => {
    const { ctx } = makeCtx();
    const create = await handlers.createVariable(
      req('POST', '', { deck_id: DECK }, variableBody, { tenant_id: TENANT }),
      ctx,
    );
    expect(create.status).toBe(201);
    const list = await handlers.listVariables(
      req('GET', '', { deck_id: DECK }, undefined, { tenant_id: TENANT }),
      ctx,
    );
    expect((list.body as { items: unknown[] }).items).toHaveLength(1);
  });

  it('rejects an invalid variable name', async () => {
    const { ctx } = makeCtx();
    const res = await handlers.createVariable(
      req('POST', '', { deck_id: DECK }, { ...variableBody, name: '$bad' }, { tenant_id: TENANT }),
      ctx,
    );
    expect(res.status).toBe(422);
  });

  it('rejects enum without values', async () => {
    const { ctx } = makeCtx();
    const res = await handlers.createVariable(
      req('POST', '', { deck_id: DECK }, { ...variableBody, type: 'enum' }, { tenant_id: TENANT }),
      ctx,
    );
    expect(res.status).toBe(422);
  });

  it('returns 409 for duplicate variable name in same deck', async () => {
    const { ctx } = makeCtx();
    await handlers.createVariable(
      req('POST', '', { deck_id: DECK }, variableBody, { tenant_id: TENANT }),
      ctx,
    );
    const res = await handlers.createVariable(
      req('POST', '', { deck_id: DECK }, variableBody, { tenant_id: TENANT }),
      ctx,
    );
    expect(res.status).toBe(409);
  });

  it('allows same variable name in another tenant', async () => {
    const { ctx } = makeCtx();
    expect(
      (
        await handlers.createVariable(
          req('POST', '', { deck_id: DECK }, variableBody, { tenant_id: TENANT }),
          ctx,
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await handlers.createVariable(
          req('POST', '', { deck_id: DECK }, variableBody, { tenant_id: OTHER_TENANT }),
          ctx,
        )
      ).status,
    ).toBe(201);
  });

  it('gets and patches a variable', async () => {
    const { ctx } = makeCtx();
    const created = await handlers.createVariable(
      req('POST', '', { deck_id: DECK }, variableBody, { tenant_id: TENANT }),
      ctx,
    );
    const id = (created.body as { id: string }).id;
    expect(
      (await handlers.getVariable(req('GET', '', { id }, undefined, { tenant_id: TENANT }), ctx))
        .status,
    ).toBe(200);
    const patched = await handlers.patchVariable(
      req('PATCH', '', { id }, { version: 0, defaultValue: 'annual' }, { tenant_id: TENANT }),
      ctx,
    );
    expect((patched.body as { defaultValue: string }).defaultValue).toBe('annual');
  });

  it('returns 409 on stale variable version', async () => {
    const { ctx } = makeCtx();
    const created = await handlers.createVariable(
      req('POST', '', { deck_id: DECK }, variableBody, { tenant_id: TENANT }),
      ctx,
    );
    const id = (created.body as { id: string }).id;
    await handlers.patchVariable(
      req('PATCH', '', { id }, { version: 0, defaultValue: 'annual' }, { tenant_id: TENANT }),
      ctx,
    );
    const res = await handlers.patchVariable(
      req('PATCH', '', { id }, { version: 0, defaultValue: 'monthly' }, { tenant_id: TENANT }),
      ctx,
    );
    expect(res.status).toBe(409);
  });

  it('deletes a variable', async () => {
    const { ctx } = makeCtx();
    const created = await handlers.createVariable(
      req('POST', '', { deck_id: DECK }, variableBody, { tenant_id: TENANT }),
      ctx,
    );
    const id = (created.body as { id: string }).id;
    expect(
      (
        await handlers.deleteVariable(
          req('DELETE', '', { id }, undefined, { tenant_id: TENANT }),
          ctx,
        )
      ).status,
    ).toBe(204);
  });
});

// ── Variable bindings ───────────────────────────────────────────────────

describe('variable binding handlers', () => {
  it('creates and lists bindings', async () => {
    const { ctx } = makeCtx();
    const input = {
      variableId: TARGET,
      targetKind: 'element_prop',
      targetId: TARGET,
      targetProp: 'text',
    };
    expect(
      (
        await handlers.createVariableBinding(
          req('POST', '', { deck_id: DECK }, input, { tenant_id: TENANT }),
          ctx,
        )
      ).status,
    ).toBe(201);
    const list = await handlers.listVariableBindings(
      req('GET', '', { deck_id: DECK }, undefined, { tenant_id: TENANT }),
      ctx,
    );
    expect((list.body as { items: unknown[] }).items).toHaveLength(1);
  });

  it('rejects invalid target kind', async () => {
    const { ctx } = makeCtx();
    const input = {
      variableId: TARGET,
      targetKind: 'host_object',
      targetId: TARGET,
      targetProp: 'x',
    };
    const res = await handlers.createVariableBinding(
      req('POST', '', { deck_id: DECK }, input, { tenant_id: TENANT }),
      ctx,
    );
    expect(res.status).toBe(422);
  });

  it('deletes a binding', async () => {
    const { ctx } = makeCtx();
    const input = {
      variableId: TARGET,
      targetKind: 'element_prop',
      targetId: TARGET,
      targetProp: 'text',
    };
    const created = await handlers.createVariableBinding(
      req('POST', '', { deck_id: DECK }, input, { tenant_id: TENANT }),
      ctx,
    );
    const id = (created.body as { id: string }).id;
    expect(
      (
        await handlers.deleteVariableBinding(
          req('DELETE', '', { id }, undefined, { tenant_id: TENANT }),
          ctx,
        )
      ).status,
    ).toBe(204);
  });
});

// ── Conditional rules ───────────────────────────────────────────────────

describe('conditional rule handlers', () => {
  it('creates and compiles a rule', async () => {
    const { ctx } = makeCtx();
    const res = await handlers.createConditionalRule(
      req('POST', '', { deck_id: DECK }, ruleBody, { tenant_id: TENANT }),
      ctx,
    );
    expect(res.status).toBe(201);
    expect((res.body as { condition: { kind: string } }).condition.kind).toBe('binary');
  });

  it('returns 422 on unsafe/invalid expression', async () => {
    const { ctx } = makeCtx();
    const res = await handlers.createConditionalRule(
      req(
        'POST',
        '',
        { deck_id: DECK },
        { ...ruleBody, conditionSource: 'eval("1")' },
        { tenant_id: TENANT },
      ),
      ctx,
    );
    expect(res.status).toBe(422);
    expect((res.body as { code: string }).code).toBe('EXPRESSION_COMPILE_ERROR');
  });

  it('lists rules by priority desc', async () => {
    const { ctx } = makeCtx();
    await handlers.createConditionalRule(
      req(
        'POST',
        '',
        { deck_id: DECK },
        { ...ruleBody, name: 'Low', priority: 1 },
        { tenant_id: TENANT },
      ),
      ctx,
    );
    await handlers.createConditionalRule(
      req(
        'POST',
        '',
        { deck_id: DECK },
        { ...ruleBody, name: 'High', priority: 10 },
        { tenant_id: TENANT },
      ),
      ctx,
    );
    const list = await handlers.listConditionalRules(
      req('GET', '', { deck_id: DECK }, undefined, { tenant_id: TENANT }),
      ctx,
    );
    expect((list.body as { items: Array<{ name: string }> }).items.map((x) => x.name)).toEqual([
      'High',
      'Low',
    ]);
  });

  it('gets and patches a rule', async () => {
    const { ctx } = makeCtx();
    const created = await handlers.createConditionalRule(
      req('POST', '', { deck_id: DECK }, ruleBody, { tenant_id: TENANT }),
      ctx,
    );
    const id = (created.body as { id: string }).id;
    expect(
      (
        await handlers.getConditionalRule(
          req('GET', '', { id }, undefined, { tenant_id: TENANT }),
          ctx,
        )
      ).status,
    ).toBe(200);
    const patched = await handlers.patchConditionalRule(
      req('PATCH', '', { id }, { version: 0, enabled: false }, { tenant_id: TENANT }),
      ctx,
    );
    expect((patched.body as { enabled: boolean }).enabled).toBe(false);
  });

  it('returns 409 on stale rule version', async () => {
    const { ctx } = makeCtx();
    const created = await handlers.createConditionalRule(
      req('POST', '', { deck_id: DECK }, ruleBody, { tenant_id: TENANT }),
      ctx,
    );
    const id = (created.body as { id: string }).id;
    await handlers.patchConditionalRule(
      req('PATCH', '', { id }, { version: 0, enabled: false }, { tenant_id: TENANT }),
      ctx,
    );
    const res = await handlers.patchConditionalRule(
      req('PATCH', '', { id }, { version: 0, enabled: true }, { tenant_id: TENANT }),
      ctx,
    );
    expect(res.status).toBe(409);
  });

  it('deletes a rule', async () => {
    const { ctx } = makeCtx();
    const created = await handlers.createConditionalRule(
      req('POST', '', { deck_id: DECK }, ruleBody, { tenant_id: TENANT }),
      ctx,
    );
    const id = (created.body as { id: string }).id;
    expect(
      (
        await handlers.deleteConditionalRule(
          req('DELETE', '', { id }, undefined, { tenant_id: TENANT }),
          ctx,
        )
      ).status,
    ).toBe(204);
  });
});

// ── Metrics / audit helpers ─────────────────────────────────────────────

describe('metrics and audit', () => {
  it('metrics snapshot and reset work', () => {
    const metrics = new PrototypeMetrics();
    metrics.inc('x');
    metrics.inc('x');
    expect(metrics.snapshot()).toEqual({ x: 2 });
    metrics.reset();
    expect(metrics.get('x')).toBe(0);
  });

  it('audit clear works', () => {
    const audit = new PrototypeAuditRecorder();
    audit.record({ tenantId: TENANT, actorId: undefined, action: 'x', payload: {} });
    expect(audit.list()).toHaveLength(1);
    audit.clear();
    expect(audit.list()).toHaveLength(0);
  });
});

// ── Interaction state handlers (P10 M3) ───────────────────────────────

const interactionStateBody = {
  instanceId: 'inst-1',
  stateMachine: {
    states: {
      idle: { label: 'Idle' },
      active: { label: 'Active' },
    },
    initial: 'idle',
    transitions: [
      { from: 'idle', to: 'active', event: 'click' },
      { from: 'active', to: 'idle', event: 'default' },
    ],
  },
  currentState: 'idle',
  scope: 'session',
  persistInstanceState: false,
};

describe('interaction state handlers', () => {
  it('creates an interaction state', async () => {
    const { ctx } = makeCtx();
    const res = await handlers.createInteractionState(
      req('POST', '', { deck_id: DECK }, interactionStateBody, { tenant_id: TENANT }),
      ctx,
    );
    expect(res.status).toBe(201);
    expect((res.body as { currentState: string }).currentState).toBe('idle');
    expect((res.body as { persistInstanceState: boolean }).persistInstanceState).toBe(false);
    expect(
      (res.body as { stateMachine: { states: Record<string, unknown> } }).stateMachine.states,
    ).toHaveProperty('idle');
  });

  it('returns 422 for an invalid state machine', async () => {
    const { ctx } = makeCtx();
    const bad = {
      ...interactionStateBody,
      stateMachine: { states: {}, initial: 'a', transitions: [] },
    };
    const res = await handlers.createInteractionState(
      req('POST', '', { deck_id: DECK }, bad, { tenant_id: TENANT }),
      ctx,
    );
    expect(res.status).toBe(422);
  });

  it('rejects transitions referencing an unknown state', async () => {
    const { ctx } = makeCtx();
    const bad = {
      ...interactionStateBody,
      stateMachine: {
        states: { idle: {}, active: {} },
        initial: 'idle',
        transitions: [{ from: 'idle', to: 'missing', event: 'click' }],
      },
    };
    const res = await handlers.createInteractionState(
      req('POST', '', { deck_id: DECK }, bad, { tenant_id: TENANT }),
      ctx,
    );
    expect(res.status).toBe(422);
  });

  it('lists interaction states per tenant', async () => {
    const { ctx } = makeCtx();
    await handlers.createInteractionState(
      req('POST', '', { deck_id: DECK }, interactionStateBody, { tenant_id: TENANT }),
      ctx,
    );
    await handlers.createInteractionState(
      req('POST', '', { deck_id: DECK }, interactionStateBody, { tenant_id: OTHER_TENANT }),
      ctx,
    );
    const res = await handlers.listInteractionStates(
      req('GET', '', { deck_id: DECK }, undefined, { tenant_id: TENANT }),
      ctx,
    );
    expect((res.body as { items: unknown[] }).items).toHaveLength(1);
  });

  it('gets an interaction state by id', async () => {
    const { ctx } = makeCtx();
    const created = await handlers.createInteractionState(
      req('POST', '', { deck_id: DECK }, interactionStateBody, { tenant_id: TENANT }),
      ctx,
    );
    const id = (created.body as { id: string }).id;
    const res = await handlers.getInteractionState(
      req('GET', '', { id }, undefined, { tenant_id: TENANT }),
      ctx,
    );
    expect(res.status).toBe(200);
  });

  it('patches persist_instance_state and current_state', async () => {
    const { ctx } = makeCtx();
    const created = await handlers.createInteractionState(
      req('POST', '', { deck_id: DECK }, interactionStateBody, { tenant_id: TENANT }),
      ctx,
    );
    const id = (created.body as { id: string }).id;
    const res = await handlers.patchInteractionState(
      req(
        'PATCH',
        '',
        { id },
        { persistInstanceState: true, currentState: 'active' },
        { tenant_id: TENANT },
      ),
      ctx,
    );
    expect(res.status).toBe(200);
    expect((res.body as { persistInstanceState: boolean }).persistInstanceState).toBe(true);
    expect((res.body as { currentState: string }).currentState).toBe('active');
  });

  it('rejects a patch with an unknown scope', async () => {
    const { ctx } = makeCtx();
    const created = await handlers.createInteractionState(
      req('POST', '', { deck_id: DECK }, interactionStateBody, { tenant_id: TENANT }),
      ctx,
    );
    const id = (created.body as { id: string }).id;
    const res = await handlers.patchInteractionState(
      req('PATCH', '', { id }, { scope: 'invalid' }, { tenant_id: TENANT }),
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it('applies a transition event and returns the next state', async () => {
    const { ctx } = makeCtx();
    const created = await handlers.createInteractionState(
      req('POST', '', { deck_id: DECK }, interactionStateBody, { tenant_id: TENANT }),
      ctx,
    );
    const id = (created.body as { id: string }).id;
    const res = await handlers.transitionInteractionState(
      req('POST', '', { deck_id: DECK, id }, { event: 'click' }, { tenant_id: TENANT }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect((res.body as { record: { currentState: string } }).record.currentState).toBe('active');
    expect(
      (res.body as { transition: { previous: string; event: string; changed: boolean } }).transition
        .previous,
    ).toBe('idle');
    expect((res.body as { transition: { event: string; changed: boolean } }).transition.event).toBe(
      'click',
    );
    expect((res.body as { transition: { changed: boolean } }).transition.changed).toBe(true);
  });

  it('rejects an unknown transition event', async () => {
    const { ctx } = makeCtx();
    const created = await handlers.createInteractionState(
      req('POST', '', { deck_id: DECK }, interactionStateBody, { tenant_id: TENANT }),
      ctx,
    );
    const id = (created.body as { id: string }).id;
    const res = await handlers.transitionInteractionState(
      req('POST', '', { deck_id: DECK, id }, { event: 'drag' }, { tenant_id: TENANT }),
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it('transition returns no-op for events with no matching edge', async () => {
    const { ctx } = makeCtx();
    const created = await handlers.createInteractionState(
      req('POST', '', { deck_id: DECK }, interactionStateBody, { tenant_id: TENANT }),
      ctx,
    );
    const id = (created.body as { id: string }).id;
    const res = await handlers.transitionInteractionState(
      req('POST', '', { deck_id: DECK, id }, { event: 'focus' }, { tenant_id: TENANT }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect((res.body as { transition: { changed: boolean } }).transition.changed).toBe(false);
  });

  it('returns 404 for a transition on an unknown interaction state', async () => {
    const { ctx } = makeCtx();
    const res = await handlers.transitionInteractionState(
      req('POST', '', { deck_id: DECK, id: TARGET }, { event: 'click' }, { tenant_id: TENANT }),
      ctx,
    );
    expect(res.status).toBe(404);
  });

  it('deletes an interaction state', async () => {
    const { ctx } = makeCtx();
    const created = await handlers.createInteractionState(
      req('POST', '', { deck_id: DECK }, interactionStateBody, { tenant_id: TENANT }),
      ctx,
    );
    const id = (created.body as { id: string }).id;
    expect(
      (
        await handlers.deleteInteractionState(
          req('DELETE', '', { id }, undefined, { tenant_id: TENANT }),
          ctx,
        )
      ).status,
    ).toBe(204);
    const after = await handlers.getInteractionState(
      req('GET', '', { id }, undefined, { tenant_id: TENANT }),
      ctx,
    );
    expect(after.status).toBe(404);
  });
});

// ── Quiz handlers (M6.1) ──────────────────────────────────────────────

const quizBody = {
  name: 'Onboarding Quiz',
  passThreshold: 0.7,
  questions: [
    {
      id: 'q1',
      type: 'multiple_choice',
      prompt: 'Capital of France?',
      correctChoiceId: 'paris',
      choices: [
        { id: 'paris', label: 'Paris' },
        { id: 'london', label: 'London' },
      ],
    },
    { id: 'q2', type: 'true_false', prompt: 'The sky is blue.', correct: true },
  ],
};

describe('Quiz handlers', () => {
  it('createQuiz rejects empty questions', async () => {
    const { ctx } = makeCtx();
    const r = await handlers.createQuiz(
      req('POST', '', { deck_id: DECK }, { name: 'Bad', questions: [] }, { tenant_id: TENANT }),
      ctx,
    );
    expect(r.status).toBe(422);
  });

  it('createQuiz rejects unknown question type', async () => {
    const { ctx } = makeCtx();
    const r = await handlers.createQuiz(
      req(
        'POST',
        '',
        { deck_id: DECK },
        {
          name: 'Bad',
          questions: [{ id: 'q1', type: 'weird', prompt: '?' }],
        },
        { tenant_id: TENANT },
      ),
      ctx,
    );
    expect(r.status).toBe(422);
  });

  it('createQuiz succeeds for a valid body', async () => {
    const { ctx } = makeCtx();
    const r = await handlers.createQuiz(
      req('POST', '', { deck_id: DECK }, quizBody, { tenant_id: TENANT }),
      ctx,
    );
    expect(r.status).toBe(201);
    expect((r.body as { passThreshold: number }).passThreshold).toBe(0.7);
  });

  it('listQuizzes returns items for tenant', async () => {
    const { ctx } = makeCtx();
    await handlers.createQuiz(
      req('POST', '', { deck_id: DECK }, quizBody, { tenant_id: TENANT }),
      ctx,
    );
    const r = await handlers.listQuizzes(
      req('GET', '', { deck_id: DECK }, undefined, { tenant_id: TENANT }),
      ctx,
    );
    expect(r.status).toBe(200);
    expect((r.body as { items: unknown[] }).items.length).toBe(1);
  });

  it('listQuizzes returns empty for other tenant', async () => {
    const { ctx } = makeCtx();
    await handlers.createQuiz(
      req('POST', '', { deck_id: DECK }, quizBody, { tenant_id: TENANT }),
      ctx,
    );
    const r = await handlers.listQuizzes(
      req('GET', '', { deck_id: DECK }, undefined, { tenant_id: OTHER_TENANT }),
      ctx,
    );
    expect((r.body as { items: unknown[] }).items.length).toBe(0);
  });

  it('patchQuiz accepts version and updates name', async () => {
    const { ctx } = makeCtx();
    const created = await handlers.createQuiz(
      req('POST', '', { deck_id: DECK }, quizBody, { tenant_id: TENANT }),
      ctx,
    );
    const id = (created.body as { id: string; version: number }).id;
    const r = await handlers.patchQuiz(
      req('PATCH', '', { id }, { version: 0, name: 'Renamed' }, { tenant_id: TENANT }),
      ctx,
    );
    expect(r.status).toBe(200);
    expect((r.body as { name: string }).name).toBe('Renamed');
  });

  it('deleteQuiz removes the quiz', async () => {
    const { ctx } = makeCtx();
    const created = await handlers.createQuiz(
      req('POST', '', { deck_id: DECK }, quizBody, { tenant_id: TENANT }),
      ctx,
    );
    const id = (created.body as { id: string }).id;
    expect(
      (await handlers.deleteQuiz(req('DELETE', '', { id }, undefined, { tenant_id: TENANT }), ctx))
        .status,
    ).toBe(204);
    expect(
      (await handlers.getQuiz(req('GET', '', { id }, undefined, { tenant_id: TENANT }), ctx))
        .status,
    ).toBe(404);
  });

  it('startAttempt requires viewerId', async () => {
    const { ctx } = makeCtx();
    const r = await handlers.startAttempt(
      req('POST', '', { quiz_id: 'X' }, {}, { tenant_id: TENANT, deck_id: DECK }),
      ctx,
    );
    expect(r.status).toBe(400);
  });

  it('startAttempt succeeds with a valid viewerId', async () => {
    const { ctx } = makeCtx();
    const created = await handlers.createQuiz(
      req('POST', '', { deck_id: DECK }, quizBody, { tenant_id: TENANT }),
      ctx,
    );
    const quizId = (created.body as { id: string }).id;
    const r = await handlers.startAttempt(
      req(
        'POST',
        '',
        { quiz_id: quizId },
        { viewerId: 'v1' },
        { tenant_id: TENANT, deck_id: DECK },
      ),
      ctx,
    );
    expect(r.status).toBe(201);
    expect((r.body as { status: string }).status).toBe('in_progress');
  });

  it('submitAnswer requires correct and score', async () => {
    const { ctx } = makeCtx();
    const r = await handlers.submitAnswer(
      req('POST', '', { attempt_id: 'a1' }, { questionId: 'q1' }, { tenant_id: TENANT }),
      ctx,
    );
    expect(r.status).toBe(400);
  });

  it('completeAttempt returns a result', async () => {
    const { ctx } = makeCtx();
    const created = await handlers.createQuiz(
      req('POST', '', { deck_id: DECK }, quizBody, { tenant_id: TENANT }),
      ctx,
    );
    const quizId = (created.body as { id: string }).id;
    const attempt = await handlers.startAttempt(
      req(
        'POST',
        '',
        { quiz_id: quizId },
        { viewerId: 'v1' },
        { tenant_id: TENANT, deck_id: DECK },
      ),
      ctx,
    );
    const attemptId = (attempt.body as { id: string }).id;
    await handlers.submitAnswer(
      req(
        'POST',
        '',
        { attempt_id: attemptId },
        {
          questionId: 'q1',
          value: 'paris',
          correct: true,
          score: 1,
        },
        { tenant_id: TENANT },
      ),
      ctx,
    );
    const r = await handlers.completeAttempt(
      req('POST', '', { attempt_id: attemptId }, undefined, { tenant_id: TENANT }),
      ctx,
    );
    expect(r.status).toBe(200);
    expect((r.body as { totalScore: number }).totalScore).toBe(1);
  });

  it('listLlmReviewQueue returns empty when none enqueued', async () => {
    const { ctx } = makeCtx();
    const r = await handlers.listLlmReviewQueue(
      req('GET', '', undefined, undefined, { tenant_id: TENANT }),
      ctx,
    );
    expect((r.body as { items: unknown[] }).items.length).toBe(0);
  });

  it('updateLlmReviewItem rejects invalid status', async () => {
    const { ctx } = makeCtx();
    const r = await handlers.updateLlmReviewItem(
      req('PATCH', '', { id: 'X' }, { status: 'NOPE' }, { tenant_id: TENANT }),
      ctx,
    );
    expect(r.status).toBe(400);
  });
});

// ── Presentation sequence handlers (M6.2) ─────────────────────────────

const sequenceBody = {
  name: 'Onboarding',
  slides: ['s1', 's2', 's3'],
  intervalMs: 1_000,
  pauseOnEvent: false,
  loop: false,
  count: 1,
  interruptionPolicy: 'queue',
  reducedMotionDefaultOff: true,
  pauseWarnAtMs: 1_800_000,
};

describe('Presentation sequence handlers', () => {
  it('createPresentationSequence rejects empty slides', async () => {
    const { ctx } = makeCtx();
    const r = await handlers.createPresentationSequence(
      req(
        'POST',
        '',
        { deck_id: DECK },
        { name: 'X', slides: [], intervalMs: 1000 },
        { tenant_id: TENANT },
      ),
      ctx,
    );
    expect(r.status).toBe(422);
  });

  it('createPresentationSequence rejects invalid interruptionPolicy', async () => {
    const { ctx } = makeCtx();
    const r = await handlers.createPresentationSequence(
      req(
        'POST',
        '',
        { deck_id: DECK },
        {
          ...sequenceBody,
          interruptionPolicy: 'NOPE',
        },
        { tenant_id: TENANT },
      ),
      ctx,
    );
    expect(r.status).toBe(422);
  });

  it('createPresentationSequence + list + get work', async () => {
    const { ctx } = makeCtx();
    const r = await handlers.createPresentationSequence(
      req('POST', '', { deck_id: DECK }, sequenceBody, { tenant_id: TENANT }),
      ctx,
    );
    expect(r.status).toBe(201);
    const id = (r.body as { id: string }).id;
    expect(
      (
        await handlers.getPresentationSequence(
          req('GET', '', { id }, undefined, { tenant_id: TENANT }),
          ctx,
        )
      ).status,
    ).toBe(200);
    const list = await handlers.listPresentationSequences(
      req('GET', '', { deck_id: DECK }, undefined, { tenant_id: TENANT }),
      ctx,
    );
    expect((list.body as { items: unknown[] }).items.length).toBe(1);
  });

  it('patchPresentationSequence updates intervalMs', async () => {
    const { ctx } = makeCtx();
    const r = await handlers.createPresentationSequence(
      req('POST', '', { deck_id: DECK }, sequenceBody, { tenant_id: TENANT }),
      ctx,
    );
    const id = (r.body as { id: string }).id;
    const patched = await handlers.patchPresentationSequence(
      req('PATCH', '', { id }, { version: 0, intervalMs: 5000 }, { tenant_id: TENANT }),
      ctx,
    );
    expect((patched.body as { intervalMs: number }).intervalMs).toBe(5000);
  });

  it('deletePresentationSequence removes the sequence', async () => {
    const { ctx } = makeCtx();
    const r = await handlers.createPresentationSequence(
      req('POST', '', { deck_id: DECK }, sequenceBody, { tenant_id: TENANT }),
      ctx,
    );
    const id = (r.body as { id: string }).id;
    expect(
      (
        await handlers.deletePresentationSequence(
          req('DELETE', '', { id }, undefined, { tenant_id: TENANT }),
          ctx,
        )
      ).status,
    ).toBe(204);
    expect(
      (
        await handlers.getPresentationSequence(
          req('GET', '', { id }, undefined, { tenant_id: TENANT }),
          ctx,
        )
      ).status,
    ).toBe(404);
  });
});
