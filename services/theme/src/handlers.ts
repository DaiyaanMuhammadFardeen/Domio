/**
 * Theme service — REST handlers (Phase 07 A.1).
 *
 * Web-framework-free handler functions that the Hono / Express /
 * Node http server can mount.  Mirrors the
 * `services/control-plane/src/branch/handlers.ts` pattern.
 *
 * Endpoints:
 *
 *   POST   /v1/tokens              createToken
 *   GET    /v1/tokens              listTokens (filter ?group=)
 *   PATCH  /v1/tokens/:id          updateToken
 *   DELETE /v1/tokens/:id          deleteToken (409 if referenced)
 *   POST   /v1/aliases             createAlias (409 if cycle)
 *   GET    /v1/aliases             listAliases
 *   DELETE /v1/aliases/:id         deleteAlias
 *   POST   /v1/themes              createTheme
 *   GET    /v1/themes              listThemes
 *   GET    /v1/themes/:id          getTheme
 *   POST   /v1/themes/:id/apply    applyTheme
 *   POST   /v1/overrides           createOverride
 *   GET    /v1/overrides           listOverrides (?deckId=)
 *   DELETE /v1/overrides/:id       deleteOverride
 *   POST   /v1/themes/resolve      resolveTokens
 *   POST   /v1/tokens/:id/referrers findReferrers
 *   POST   /v1/themes/diff         computeThemeDiff
 */

import type { TokenValue } from '@domio/tokens';
import {
  ThemeService,
  type ApplyThemeResult,
  type CreateTokenInput,
  type CreateAliasInput,
  type CreateThemeInput,
  type CreateOverrideInput,
  type ApplyThemeInput,
  TokenAliasCycleError,
  TokenReferencedError,
  InvalidTokenIdError,
  TokenValidationError,
  ThemeNotFoundError,
} from './service.js';
import type { ThemeMetrics } from './metrics.js';
import type { AuditRecorder } from './audit.js';

// ---------------------------------------------------------------------------
// HTTP types
// ---------------------------------------------------------------------------

export interface HttpRequest<P = unknown, B = unknown, Q = Record<string, string | undefined>> {
  readonly method: string;
  readonly path: string;
  readonly params: P;
  readonly body: B;
  readonly query: Q;
  readonly headers: Record<string, string | undefined>;
}

export interface HttpResponse {
  readonly status: number;
  readonly body: unknown;
}

export interface ThemeHandlerContext {
  readonly service: ThemeService;
  readonly metrics?: ThemeMetrics;
  readonly audit?: AuditRecorder;
  /** Actor ID for audit logging; usually from the auth header. */
  resolveActorId?: (req: HttpRequest) => string | undefined;
  /** ACL guard; should reject viewers before data is read. */
  authorize?: (args: {
    actorId: string | undefined;
    action: 'read' | 'write-token' | 'write-theme' | 'write-override';
  }) => void;
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
  return { status: 204, body: null };
}
function badRequest(message: string, code: string): HttpResponse {
  return { status: 400, body: { error: message, code } };
}
function unauthorized(): HttpResponse {
  return { status: 401, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } };
}
function forbidden(): HttpResponse {
  return { status: 403, body: { error: 'Forbidden', code: 'FORBIDDEN' } };
}
void forbidden;
function notFound(message: string): HttpResponse {
  return { status: 404, body: { error: message, code: 'NOT_FOUND' } };
}
function conflict(message: string, code: string, extra?: Record<string, unknown>): HttpResponse {
  return { status: 409, body: { error: message, code, ...(extra ?? {}) } };
}

// ---------------------------------------------------------------------------
// Token endpoints
// ---------------------------------------------------------------------------

export async function createTokenHandler(
  req: HttpRequest<
    { orgId: string },
    Omit<CreateTokenInput, 'orgId' | 'createdBy'> & { createdBy?: string },
    { actorId?: string }
  >,
  ctx: ThemeHandlerContext,
): Promise<HttpResponse> {
  const actorId = req.body.createdBy ?? req.query.actorId ?? ctx.resolveActorId?.(req);
  if (!actorId) return unauthorized();
  ctx.authorize?.({ actorId, action: 'write-token' });
  const { createdBy: _ignored, ...rest } = req.body;
  void _ignored;
  try {
    const record = await ctx.service.createToken({
      ...rest,
      orgId: req.params.orgId,
      createdBy: actorId,
    });
    ctx.audit?.record({
      orgId: req.params.orgId,
      actorId,
      action: 'token.create',
      payload: { tokenId: record.tokenId, group: record.group },
    });
    return created(record);
  } catch (e) {
    if (e instanceof InvalidTokenIdError) return badRequest(e.message, e.code);
    if (e instanceof TokenValidationError) return badRequest(e.message, e.code);
    throw e;
  }
}

export async function listTokensHandler(
  req: HttpRequest<{ orgId: string }, undefined, { group?: string }>,
  ctx: ThemeHandlerContext,
): Promise<HttpResponse> {
  const actorId = ctx.resolveActorId?.(req);
  ctx.authorize?.({ actorId, action: 'read' });
  const tokens = await ctx.service.listTokens(req.params.orgId, req.query.group as never);
  return ok({ tokens });
}

export async function updateTokenHandler(
  req: HttpRequest<
    { orgId: string; tokenId: string },
    { value?: TokenValue; description?: string; roles?: readonly string[] },
    { actorId?: string }
  >,
  ctx: ThemeHandlerContext,
): Promise<HttpResponse> {
  const actorId = req.query.actorId ?? ctx.resolveActorId?.(req);
  if (!actorId) return unauthorized();
  ctx.authorize?.({ actorId, action: 'write-token' });
  const updated = await ctx.service.updateToken(
    req.params.tokenId,
    req.params.orgId,
    {
      ...(req.body.value !== undefined ? { value: req.body.value } : {}),
      ...(req.body.description !== undefined ? { description: req.body.description } : {}),
      ...(req.body.roles !== undefined ? { roles: req.body.roles as never } : {}),
    },
    actorId,
  );
  ctx.audit?.record({
    orgId: req.params.orgId,
    actorId,
    action: 'token.update',
    payload: { tokenId: req.params.tokenId },
  });
  return ok(updated);
}

export async function deleteTokenHandler(
  req: HttpRequest<
    { orgId: string; tokenId: string },
    undefined,
    { force?: string; actorId?: string }
  >,
  ctx: ThemeHandlerContext,
): Promise<HttpResponse> {
  const actorId = req.query.actorId ?? ctx.resolveActorId?.(req);
  if (!actorId) return unauthorized();
  ctx.authorize?.({ actorId, action: 'write-token' });
  try {
    await ctx.service.deleteToken(req.params.tokenId, req.params.orgId);
    ctx.audit?.record({
      orgId: req.params.orgId,
      actorId,
      action: 'token.delete',
      payload: { tokenId: req.params.tokenId },
    });
    return noContent();
  } catch (e) {
    if (e instanceof TokenReferencedError) {
      ctx.metrics?.recordDeletionBlock();
      return conflict(e.message, e.code, { count: e.count, sampleReferrers: e.sampleReferrers });
    }
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Alias endpoints
// ---------------------------------------------------------------------------

export async function createAliasHandler(
  req: HttpRequest<{ orgId: string }, Omit<CreateAliasInput, 'orgId'>, { actorId?: string }>,
  ctx: ThemeHandlerContext,
): Promise<HttpResponse> {
  const actorId = req.query.actorId ?? ctx.resolveActorId?.(req);
  if (!actorId) return unauthorized();
  ctx.authorize?.({ actorId, action: 'write-token' });
  try {
    const record = await ctx.service.createAlias({ ...req.body, orgId: req.params.orgId });
    ctx.audit?.record({
      orgId: req.params.orgId,
      actorId,
      action: 'alias.create',
      payload: { aliasTokenId: record.aliasTokenId, targetTokenId: record.targetTokenId },
    });
    return created(record);
  } catch (e) {
    if (e instanceof TokenAliasCycleError) {
      ctx.metrics?.recordAliasCycle();
      return conflict(e.message, e.code, { cycle: e.cycle });
    }
    if (e instanceof InvalidTokenIdError) return badRequest(e.message, e.code);
    throw e;
  }
}

export async function listAliasesHandler(
  req: HttpRequest<{ orgId: string }, undefined, { actorId?: string }>,
  ctx: ThemeHandlerContext,
): Promise<HttpResponse> {
  const actorId = req.query.actorId ?? ctx.resolveActorId?.(req);
  ctx.authorize?.({ actorId, action: 'read' });
  const aliases = await ctx.service.listAliases(req.params.orgId);
  return ok({ aliases });
}

export async function deleteAliasHandler(
  req: HttpRequest<{ orgId: string; aliasTokenId: string }, undefined, { actorId?: string }>,
  ctx: ThemeHandlerContext,
): Promise<HttpResponse> {
  const actorId = req.query.actorId ?? ctx.resolveActorId?.(req);
  if (!actorId) return unauthorized();
  ctx.authorize?.({ actorId, action: 'write-token' });
  await ctx.service.deleteAlias(req.params.aliasTokenId, req.params.orgId);
  ctx.audit?.record({
    orgId: req.params.orgId,
    actorId,
    action: 'alias.delete',
    payload: { aliasTokenId: req.params.aliasTokenId },
  });
  return noContent();
}

// ---------------------------------------------------------------------------
// Theme endpoints
// ---------------------------------------------------------------------------

export async function createThemeHandler(
  req: HttpRequest<
    { orgId: string },
    Omit<CreateThemeInput, 'orgId' | 'createdBy'> & { createdBy?: string },
    { actorId?: string }
  >,
  ctx: ThemeHandlerContext,
): Promise<HttpResponse> {
  const actorId = req.body.createdBy ?? req.query.actorId ?? ctx.resolveActorId?.(req);
  if (!actorId) return unauthorized();
  ctx.authorize?.({ actorId, action: 'write-theme' });
  const { createdBy: _ignored, ...rest } = req.body;
  void _ignored;
  const theme = await ctx.service.createTheme({
    ...rest,
    orgId: req.params.orgId,
    createdBy: actorId,
  });
  ctx.audit?.record({
    orgId: req.params.orgId,
    actorId,
    action: 'theme.create',
    payload: { themeId: theme.themeId, name: theme.name, kind: theme.kind },
  });
  return created(theme);
}

export async function listThemesHandler(
  req: HttpRequest<{ orgId: string }, undefined, { kind?: string; actorId?: string }>,
  ctx: ThemeHandlerContext,
): Promise<HttpResponse> {
  const actorId = req.query.actorId ?? ctx.resolveActorId?.(req);
  ctx.authorize?.({ actorId, action: 'read' });
  const themes = await ctx.service.listThemes(req.params.orgId, req.query.kind as never);
  return ok({ themes });
}

export async function getThemeHandler(
  req: HttpRequest<{ orgId: string; themeId: string }, undefined, { actorId?: string }>,
  ctx: ThemeHandlerContext,
): Promise<HttpResponse> {
  const actorId = req.query.actorId ?? ctx.resolveActorId?.(req);
  ctx.authorize?.({ actorId, action: 'read' });
  try {
    const theme = await ctx.service.getTheme(req.params.themeId, req.params.orgId);
    return ok(theme);
  } catch (e) {
    if (e instanceof ThemeNotFoundError) return notFound(e.message);
    throw e;
  }
}

export async function applyThemeHandler(
  req: HttpRequest<
    { orgId: string; themeId: string },
    Omit<ApplyThemeInput, 'orgId' | 'toThemeId' | 'actorId'> & { actorId?: string }
  >,
  ctx: ThemeHandlerContext,
): Promise<HttpResponse> {
  const actorId = req.body.actorId ?? ctx.resolveActorId?.(req);
  if (!actorId) return unauthorized();
  ctx.authorize?.({ actorId, action: 'write-theme' });
  const { actorId: _ignored, ...rest } = req.body;
  void _ignored;
  let result: ApplyThemeResult;
  try {
    result = await ctx.service.applyTheme({
      ...rest,
      orgId: req.params.orgId,
      toThemeId: req.params.themeId,
      actorId,
    });
  } catch (e) {
    if (e instanceof ThemeNotFoundError) return notFound(e.message);
    throw e;
  }
  ctx.metrics?.recordThemeApply(result.latencyMs);
  ctx.audit?.record({
    orgId: req.params.orgId,
    actorId,
    action: 'theme.apply',
    payload: {
      themeId: req.params.themeId,
      deckId: req.body.deckId,
      tokensChangedCount: result.tokensChangedCount,
      latencyMs: result.latencyMs,
    },
  });
  return ok(result);
}

// ---------------------------------------------------------------------------
// Override endpoints
// ---------------------------------------------------------------------------

export async function createOverrideHandler(
  req: HttpRequest<
    { orgId: string },
    Omit<CreateOverrideInput, 'orgId' | 'createdBy'> & { createdBy?: string },
    { actorId?: string }
  >,
  ctx: ThemeHandlerContext,
): Promise<HttpResponse> {
  const actorId = req.body.createdBy ?? req.query.actorId ?? ctx.resolveActorId?.(req);
  if (!actorId) return unauthorized();
  ctx.authorize?.({ actorId, action: 'write-override' });
  const { createdBy: _ignored, ...rest } = req.body;
  void _ignored;
  const record = await ctx.service.createOverride({
    ...rest,
    orgId: req.params.orgId,
    createdBy: actorId,
  });
  ctx.metrics?.recordOverride();
  ctx.audit?.record({
    orgId: req.params.orgId,
    actorId,
    action: 'override.create',
    payload: { overrideId: record.overrideId, deckId: record.deckId, scope: record.scope.kind },
  });
  return created(record);
}

export async function listOverridesHandler(
  req: HttpRequest<{ orgId: string }, undefined, { deckId?: string; actorId?: string }>,
  ctx: ThemeHandlerContext,
): Promise<HttpResponse> {
  const actorId = req.query.actorId ?? ctx.resolveActorId?.(req);
  ctx.authorize?.({ actorId, action: 'read' });
  const deckId = req.query.deckId;
  if (!deckId) return badRequest('deckId query param is required', 'DECK_ID_REQUIRED');
  const overrides = await ctx.service.listOverrides(deckId, req.params.orgId);
  return ok({ overrides });
}

export async function deleteOverrideHandler(
  req: HttpRequest<{ orgId: string; overrideId: string }, undefined, { actorId?: string }>,
  ctx: ThemeHandlerContext,
): Promise<HttpResponse> {
  const actorId = req.query.actorId ?? ctx.resolveActorId?.(req);
  if (!actorId) return unauthorized();
  ctx.authorize?.({ actorId, action: 'write-override' });
  await ctx.service.deleteOverride(req.params.overrideId, req.params.orgId);
  ctx.audit?.record({
    orgId: req.params.orgId,
    actorId,
    action: 'override.delete',
    payload: { overrideId: req.params.overrideId },
  });
  return noContent();
}

// ---------------------------------------------------------------------------
// Engine read-throughs
// ---------------------------------------------------------------------------

export async function resolveTokensHandler(
  req: HttpRequest<
    { orgId: string },
    { tokenRefs: string[]; deckId?: string; scope?: { kind: 'deck' | 'theme' | 'org' | 'brand' } }
  >,
  ctx: ThemeHandlerContext,
): Promise<HttpResponse> {
  const actorId = ctx.resolveActorId?.(req);
  ctx.authorize?.({ actorId, action: 'read' });
  const resolved = await ctx.service.resolveTokens(
    req.params.orgId,
    req.body.deckId,
    req.body.tokenRefs,
    req.body.scope ?? { kind: 'deck' },
  );
  return ok({ resolved: Object.fromEntries(resolved) });
}

export async function findReferrersHandler(
  req: HttpRequest<{ orgId: string; tokenId: string }, { deckId?: string }>,
  ctx: ThemeHandlerContext,
): Promise<HttpResponse> {
  const actorId = ctx.resolveActorId?.(req);
  ctx.authorize?.({ actorId, action: 'read' });
  const refs = await ctx.service.findReferrers(
    req.params.orgId,
    req.body.deckId,
    req.params.tokenId,
  );
  return ok(refs);
}

export async function computeThemeDiffHandler(
  req: HttpRequest<{ orgId: string }, { themeAId: string; themeBId: string }>,
  ctx: ThemeHandlerContext,
): Promise<HttpResponse> {
  const actorId = ctx.resolveActorId?.(req);
  ctx.authorize?.({ actorId, action: 'read' });
  const diff = await ctx.service.computeThemeDiff(
    req.body.themeAId,
    req.body.themeBId,
    req.params.orgId,
  );
  return ok({ diff });
}

export const handlers = {
  createToken: createTokenHandler,
  listTokens: listTokensHandler,
  updateToken: updateTokenHandler,
  deleteToken: deleteTokenHandler,
  createAlias: createAliasHandler,
  listAliases: listAliasesHandler,
  deleteAlias: deleteAliasHandler,
  createTheme: createThemeHandler,
  listThemes: listThemesHandler,
  getTheme: getThemeHandler,
  applyTheme: applyThemeHandler,
  createOverride: createOverrideHandler,
  listOverrides: listOverridesHandler,
  deleteOverride: deleteOverrideHandler,
  resolveTokens: resolveTokensHandler,
  findReferrers: findReferrersHandler,
  computeThemeDiff: computeThemeDiffHandler,
} as const;
