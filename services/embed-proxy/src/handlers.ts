/**
 * Embed proxy — embed page + handler types (Phase 08/11).
 *
 * The embed handler serves the `/v1/embed/:bindingId` page and
 * manages token creation + proxy forwarding.
 *
 * Phase 11 additions: embed policy CRUD handlers.
 *
 * Public surface:
 *  - {@link embedHandlers} — handler-function signatures.
 *  - {@link policyHandlers} — policy CRUD handler signatures.
 *  - {@link EmbedHandlerContext} — deps bag.
 *  - {@link PolicyHandlerContext} — deps bag for policy handlers.
 */

import type { EmbedTokenService } from './tokens.js';
import { proxyHandler, type ProxyHandlerContext } from './proxy.js';
import type { HttpRequest, HttpResponse } from './types.js';
import { PolicyNotFoundError, PolicyValidationError } from './policies.js';
import type { EmbedPolicyService, CreatePolicyInput, UpdatePolicyInput } from './policies.js';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface EmbedHandlerContext {
  readonly tokenService: EmbedTokenService;
  /** Fetch for upstream calls (proxy passthrough). */
  readonly fetchFn?: typeof fetch;
  /** Resolve a binding ID to its target URL. */
  readonly resolveBinding: (bindingId: string) => Promise<{ url: string } | null>;
}

export interface PolicyHandlerContext {
  readonly policyService: EmbedPolicyService;
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function ok<T>(body: T): HttpResponse {
  return { status: 200, body };
}
function created<T>(body: T): HttpResponse {
  return { status: 201, body };
}
function noContent(): HttpResponse {
  return { status: 204, body: undefined };
}
function badRequest(message: string, code: string): HttpResponse {
  return { status: 400, body: { error: message, code } };
}
function unauthorized(message: string, code: string): HttpResponse {
  return { status: 401, body: { error: message, code } };
}
function notFound(message: string): HttpResponse {
  return { status: 404, body: { error: message, code: 'NOT_FOUND' } };
}

// ---------------------------------------------------------------------------
// Embed handler — serves the embed proxy endpoint
// ---------------------------------------------------------------------------

/**
 * POST /v1/embed/:bindingId/proxy
 *
 * Creates a short-lived single-use token and proxies the request to
 * the binding's target URL.
 */
export async function embedProxyHandler(
  req: HttpRequest<{ bindingId: string }, undefined, Record<string, string | undefined>>,
  ctx: EmbedHandlerContext,
): Promise<HttpResponse> {
  const { bindingId } = req.params;

  // Resolve the binding
  const binding = await ctx.resolveBinding(bindingId);
  if (!binding) return notFound(`Binding not found: ${bindingId}`);

  // Create token
  const record = ctx.tokenService.create(bindingId, binding.url);

  // Proxy through
  const proxyCtx: ProxyHandlerContext = {
    tokenService: ctx.tokenService,
    ...(ctx.fetchFn !== undefined ? { fetchFn: ctx.fetchFn } : {}),
  };

  return proxyHandler(
    {
      method: 'POST',
      path: '',
      params: { token: record.token },
      body: undefined,
      query: {},
      headers: req.headers,
    },
    proxyCtx,
  );
}

/**
 * POST /v1/embed/tokens
 *
 * Create an embed token for a binding.
 */
export async function createEmbedTokenHandler(
  req: HttpRequest<undefined, { bindingId: string; url: string }>,
  ctx: EmbedHandlerContext,
): Promise<HttpResponse> {
  const { bindingId, url } = req.body;
  if (!bindingId || !url) return badRequest('bindingId and url are required', 'MISSING_FIELDS');
  const record = ctx.tokenService.create(bindingId, url);
  return ok({ token: record.token, expiresAt: record.expiresAt });
}

/**
 * GET /v1/embed/tokens/:token
 *
 * Validate an embed token (for the embed page to check before loading).
 */
export async function validateEmbedTokenHandler(
  req: HttpRequest<{ token: string }>,
  ctx: EmbedHandlerContext,
): Promise<HttpResponse> {
  const record = ctx.tokenService.peek(req.params.token);
  if (!record) return unauthorized('Invalid embed token', 'INVALID_TOKEN');
  if (record.used) return unauthorized('Embed token already used', 'TOKEN_ALREADY_USED');
  if (ctx.tokenService.now() > record.expiresAt.getTime())
    return unauthorized('Embed token expired', 'TOKEN_EXPIRED');
  return ok({ bindingId: record.bindingId, expiresAt: record.expiresAt });
}

// ---------------------------------------------------------------------------
// Policy CRUD handlers (Phase 11)
// ---------------------------------------------------------------------------

/**
 * GET /v1/embed_policies?workspace_id=...
 *
 * List embed policies for a workspace.
 */
export async function listPoliciesHandler(
  req: HttpRequest<undefined, undefined, Record<string, string | undefined>>,
  ctx: PolicyHandlerContext,
): Promise<HttpResponse> {
  const workspaceId = req.query.workspace_id;
  if (!workspaceId) return badRequest('workspace_id is required', 'MISSING_WORKSPACE_ID');
  const policies = ctx.policyService.listByWorkspace(workspaceId);
  return ok({ items: policies });
}

/**
 * POST /v1/embed_policies
 *
 * Create a new embed policy.
 */
export async function createPolicyHandler(
  req: HttpRequest<undefined, CreatePolicyInput>,
  ctx: PolicyHandlerContext,
): Promise<HttpResponse> {
  try {
    const policy = ctx.policyService.create(req.body);
    return created(policy);
  } catch (e) {
    if (e instanceof PolicyValidationError) {
      return badRequest(e.message, 'POLICY_VALIDATION_ERROR');
    }
    throw e;
  }
}

/**
 * GET /v1/embed_policies/:id
 *
 * Get an embed policy by ID.
 */
export async function getPolicyHandler(
  req: HttpRequest<{ id: string }>,
  ctx: PolicyHandlerContext,
): Promise<HttpResponse> {
  const policy = ctx.policyService.getById(req.params.id);
  if (!policy) return notFound(`Policy not found: ${req.params.id}`);
  return ok(policy);
}

/**
 * PUT /v1/embed_policies/:id
 *
 * Update an embed policy.
 */
export async function updatePolicyHandler(
  req: HttpRequest<{ id: string }, UpdatePolicyInput>,
  ctx: PolicyHandlerContext,
): Promise<HttpResponse> {
  try {
    const policy = ctx.policyService.update(req.params.id, req.body);
    return ok(policy);
  } catch (e) {
    if (e instanceof PolicyNotFoundError) {
      return notFound(`Policy not found: ${req.params.id}`);
    }
    if (e instanceof PolicyValidationError) {
      return badRequest(e.message, 'POLICY_VALIDATION_ERROR');
    }
    throw e;
  }
}

/**
 * DELETE /v1/embed_policies/:id
 *
 * Delete an embed policy.
 */
export async function deletePolicyHandler(
  req: HttpRequest<{ id: string }>,
  ctx: PolicyHandlerContext,
): Promise<HttpResponse> {
  const deleted = ctx.policyService.delete(req.params.id);
  if (!deleted) return notFound(`Policy not found: ${req.params.id}`);
  return noContent();
}

// ---------------------------------------------------------------------------
// Named handlers + grouped export
// ---------------------------------------------------------------------------

export const embedHandlers = {
  proxy: embedProxyHandler,
  createToken: createEmbedTokenHandler,
  validateToken: validateEmbedTokenHandler,
} as const;

export const policyHandlers = {
  list: listPoliciesHandler,
  create: createPolicyHandler,
  get: getPolicyHandler,
  update: updatePolicyHandler,
  delete: deletePolicyHandler,
} as const;
