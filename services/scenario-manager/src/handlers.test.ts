/**
 * Scenario-manager handler tests — CRUD + 400 cycle + 404 + 401.
 */

import { describe, it, expect } from 'vitest';
import { handlers, type HttpRequest, type ScenarioHandlerContext } from './handlers.js';
import { ScenarioService } from './service.js';
import {
  InMemoryScenarioRepository,
  InMemoryOverlayRepository,
  InMemoryAnnotationRepository,
  InMemoryThresholdRuleRepository,
} from './dal.js';
import { ScenarioMetrics } from './metrics.js';
import { InMemoryAuditRecorder } from './audit.js';

const TENANT = 't1';
const ACTOR = 'alice';

function makeCtx() {
  const svc = new ScenarioService({
    scenarios: new InMemoryScenarioRepository(),
    overlays: new InMemoryOverlayRepository(),
    annotations: new InMemoryAnnotationRepository(),
    thresholdRules: new InMemoryThresholdRuleRepository(),
    idGenerator: () => `scn_${Math.random().toString(36).slice(2, 8)}`,
  });
  const metrics = new ScenarioMetrics();
  const audit = new InMemoryAuditRecorder(() => 'unused');
  return {
    svc,
    ctx: { service: svc, metrics, audit } as { service: ScenarioService; metrics: ScenarioMetrics; audit: InMemoryAuditRecorder; authorize?: ScenarioHandlerContext['authorize'] },
    metrics,
    audit,
  };
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

describe('scenario handlers — CRUD', () => {
  it('POST /v1/scenarios creates a root scenario', async () => {
    const { ctx } = makeCtx();
    const res = await handlers.createScenario(
      req('POST', '/v1/scenarios', { tenantId: TENANT }, {
        deckId: 'deck-1',
        parentId: null,
        name: 'Baseline',
        description: 'Base scenario',
      }, { actorId: ACTOR }),
      ctx,
    );
    expect(res.status).toBe(201);
    expect((res.body as { id: string }).id).toBeDefined();
  });

  it('GET /v1/scenarios/:id returns the scenario', async () => {
    const { ctx, svc } = makeCtx();
    const created = await svc.createScenario({
      tenantId: TENANT,
      deckId: 'deck-1',
      parentId: null,
      name: 'Test',
      description: '',
      createdBy: ACTOR,
    });
    const res = await handlers.getScenario(
      req('GET', '/v1/scenarios/:id', { tenantId: TENANT, id: created.id }, undefined, { actorId: ACTOR }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect((res.body as { name: string }).name).toBe('Test');
  });

  it('GET /v1/scenarios/:id returns 404 for unknown', async () => {
    const { ctx } = makeCtx();
    const res = await handlers.getScenario(
      req('GET', '/v1/scenarios/:id', { tenantId: TENANT, id: 'unknown' }, undefined, { actorId: ACTOR }),
      ctx,
    );
    expect(res.status).toBe(404);
  });

  it('GET /v1/scenarios?deck_id= lists scenarios', async () => {
    const { ctx, svc } = makeCtx();
    await svc.createScenario({
      tenantId: TENANT,
      deckId: 'deck-1',
      parentId: null,
      name: 'A',
      description: '',
      createdBy: ACTOR,
    });
    const res = await handlers.listByDeck(
      req('GET', '/v1/scenarios', { tenantId: TENANT }, undefined, { deck_id: 'deck-1', actorId: ACTOR }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect((res.body as { scenarios: unknown[] }).scenarios.length).toBe(1);
  });

  it('DELETE /v1/scenarios/:id removes the scenario', async () => {
    const { ctx, svc } = makeCtx();
    const created = await svc.createScenario({
      tenantId: TENANT,
      deckId: 'deck-1',
      parentId: null,
      name: 'ToDelete',
      description: '',
      createdBy: ACTOR,
    });
    const res = await handlers.deleteScenario(
      req('DELETE', '/v1/scenarios/:id', { tenantId: TENANT, id: created.id }, undefined, { actorId: ACTOR }),
      ctx,
    );
    expect(res.status).toBe(204);
  });
});

describe('scenario handlers — 400 cycle', () => {
  it('POST /v1/scenarios 400s when creating a cycle', async () => {
    const { ctx, svc } = makeCtx();
    const parent = await svc.createScenario({
      tenantId: TENANT,
      deckId: 'deck-1',
      parentId: null,
      name: 'Parent',
      description: '',
      createdBy: ACTOR,
    });
    const child = await svc.createScenario({
      tenantId: TENANT,
      deckId: 'deck-1',
      parentId: parent.id,
      name: 'Child',
      description: '',
      createdBy: ACTOR,
    });
    // Try to make Parent a child of Child → cycle
    const res = await handlers.updateScenario(
      req('PATCH', '/v1/scenarios/:id', { tenantId: TENANT, id: parent.id }, {
        parentId: child.id,
      }, { actorId: ACTOR }),
      ctx,
    );
    expect(res.status).toBe(400);
    expect((res.body as { code: string }).code).toBe('SCENARIO_CYCLE');
  });
});

describe('scenario handlers — 401', () => {
  it('rejects writes when no actorId', async () => {
    const { ctx } = makeCtx();
    const res = await handlers.createScenario(
      req('POST', '/v1/scenarios', { tenantId: TENANT }, {
        deckId: 'deck-1',
        parentId: null,
        name: 'Test',
        description: '',
      }),
      ctx,
    );
    expect(res.status).toBe(401);
  });
});

describe('scenario handlers — ACL', () => {
  it('rejects writes when authorize() throws', async () => {
    const { ctx } = makeCtx();
    ctx.authorize = () => {
      throw new Error('Forbidden');
    };
    await expect(
      handlers.createScenario(
        req('POST', '/v1/scenarios', { tenantId: TENANT }, {
          deckId: 'deck-1',
          parentId: null,
          name: 'Test',
          description: '',
        }, { actorId: ACTOR }),
        ctx,
      ),
    ).rejects.toThrow('Forbidden');
  });
});

describe('scenario handlers — audit', () => {
  it('records audit events on writes', async () => {
    const { ctx, audit } = makeCtx();
    await handlers.createScenario(
      req('POST', '/v1/scenarios', { tenantId: TENANT }, {
        deckId: 'deck-1',
        parentId: null,
        name: 'Audited',
        description: '',
      }, { actorId: ACTOR }),
      ctx,
    );
    const events = await audit.listByTenant(TENANT);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0]?.action).toBe('scenario.create');
  });
});
