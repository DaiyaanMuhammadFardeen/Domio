/**
 * Code Sandbox — Hono routes.
 *
 * REST endpoints per sandbox-policies.yaml + sandbox-runs.yaml:
 *   GET    /v1/sandbox_policies            (list by workspace_id)
 *   POST   /v1/sandbox_policies            (create)
 *   GET    /v1/sandbox_policies/:id        (get by id)
 *   PUT    /v1/sandbox_policies/:id        (update)
 *   DELETE /v1/sandbox_policies/:id        (delete)
 *   POST   /v1/sandbox/run                 (execute code)
 */

import { Hono } from 'hono';
import { type SandboxPolicyService } from './policies.js';
import { SandboxPolicyNotFoundError } from './repo.js';
import { runSandboxCode } from './runner.js';
import { validateCreatePolicy, validateUpdatePolicy, validateSandboxRun } from './schemas.js';
import type { SandboxPolicy } from './repo.js';

// ---------------------------------------------------------------------------
// Route context
// ---------------------------------------------------------------------------

export interface SandboxRouteDeps {
  readonly policyService: SandboxPolicyService;
}

export function createSandboxRoutes(deps: SandboxRouteDeps): Hono {
  const app = new Hono();
  const { policyService } = deps;

  // -------------------------------------------------------------------------
  // Policy CRUD
  // -------------------------------------------------------------------------

  // List policies by workspace_id
  app.get('/v1/sandbox_policies', async (c) => {
    const workspaceId = c.req.query('workspace_id');
    if (!workspaceId) {
      return c.json(
        { code: 'VALIDATION_ERROR', message: 'workspace_id query parameter is required' },
        400,
      );
    }
    const policies = await policyService.listPolicies(workspaceId);
    return c.json({ items: policies });
  });

  // Create policy
  app.post('/v1/sandbox_policies', async (c) => {
    const body = await c.req.json();
    const validation = validateCreatePolicy(body);
    if (!validation.valid) {
      return c.json(
        { code: 'VALIDATION_ERROR', message: validation.errors.map((e) => e.message).join('; ') },
        400,
      );
    }
    const { policy, validation: createValidation } = await policyService.createPolicy(body);
    if (!createValidation.valid) {
      return c.json(
        {
          code: 'VALIDATION_ERROR',
          message: createValidation.errors.map((e) => e.message).join('; '),
        },
        400,
      );
    }
    return c.json(policy, 201);
  });

  // Get policy by id
  app.get('/v1/sandbox_policies/:id', async (c) => {
    const id = c.req.param('id');
    try {
      const policy = await policyService.getPolicy(id);
      return c.json(policy);
    } catch (e) {
      if (e instanceof SandboxPolicyNotFoundError) {
        return c.json({ code: 'NOT_FOUND', message: e.message }, 404);
      }
      throw e;
    }
  });

  // Update policy
  app.put('/v1/sandbox_policies/:id', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json();
    const validation = validateUpdatePolicy(body);
    if (!validation.valid) {
      return c.json(
        { code: 'VALIDATION_ERROR', message: validation.errors.map((e) => e.message).join('; ') },
        400,
      );
    }
    try {
      const { policy, validation: updateValidation } = await policyService.updatePolicy(id, body);
      if (!updateValidation.valid) {
        return c.json(
          {
            code: 'VALIDATION_ERROR',
            message: updateValidation.errors.map((e) => e.message).join('; '),
          },
          400,
        );
      }
      return c.json(policy);
    } catch (e) {
      if (e instanceof SandboxPolicyNotFoundError) {
        return c.json({ code: 'NOT_FOUND', message: e.message }, 404);
      }
      throw e;
    }
  });

  // Delete policy
  app.delete('/v1/sandbox_policies/:id', async (c) => {
    const id = c.req.param('id');
    try {
      await policyService.deletePolicy(id);
      return c.body(null, 204);
    } catch (e) {
      if (e instanceof SandboxPolicyNotFoundError) {
        return c.json({ code: 'NOT_FOUND', message: e.message }, 404);
      }
      throw e;
    }
  });

  // -------------------------------------------------------------------------
  // Sandbox run
  // -------------------------------------------------------------------------

  app.post('/v1/sandbox/run', async (c) => {
    const body = await c.req.json();
    const validation = validateSandboxRun(body);
    if (!validation.valid) {
      return c.json(
        { code: 'VALIDATION_ERROR', message: validation.errors.map((e) => e.message).join('; ') },
        400,
      );
    }

    const { policyId, code } = body as { policyId: string; code: string };

    // Validate policy exists
    let policy: SandboxPolicy;
    try {
      policy = await policyService.getPolicy(policyId);
    } catch (e) {
      if (e instanceof SandboxPolicyNotFoundError) {
        return c.json({ code: 'NOT_FOUND', message: `Policy ${policyId} not found` }, 404);
      }
      throw e;
    }

    // Run the code
    const result = await runSandboxCode(code, policy);
    return c.json({
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      killed: result.killed,
      ...(result.killedReason !== undefined ? { killedReason: result.killedReason } : {}),
    });
  });

  return app;
}
