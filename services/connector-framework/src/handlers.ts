/**
 * Connector framework — Hono HTTP handlers (Phase 08).
 *
 * Thin wrappers around the ConnectorService that parse HTTP requests
 * and return HTTP responses.
 */

import { Hono } from 'hono';
import type { ConnectorService } from './service.js';
import type { ConnectorMetrics } from './metrics.js';
import type { ConnectorId } from './types.js';
import { ConnectorNotFoundError, AuthStateMismatchError, AdapterVersionMismatchError } from './types.js';

export interface HandlerContext {
  readonly service: ConnectorService;
  readonly metrics: ConnectorMetrics | undefined;
}

function errorEnvelope(code: string, message: string) {
  return { error: { code, message } };
}

export function createConnectorHandlers(ctx: HandlerContext): Hono {
  const app = new Hono();

  // POST /v1/connectors/:connector_id/auth/start
  app.post('/v1/connectors/:connector_id/auth/start', async (c) => {
    const connector_id = c.req.param('connector_id') as ConnectorId;
    const body = await c.req.json<{ version: string; tenant_id: string; redirect_uri?: string; scope?: string[] }>();
    try {
      const spec: { connection_id: string; redirect_uri?: string; scope?: string[] } = { connection_id: '' };
      if (body.redirect_uri !== undefined) spec.redirect_uri = body.redirect_uri;
      if (body.scope !== undefined) spec.scope = body.scope;
      const result = await ctx.service.authStart(connector_id, body.version, body.tenant_id, spec);
      return c.json(result, 200);
    } catch (e) {
      if (e instanceof AdapterVersionMismatchError) return c.json(errorEnvelope(e.code, e.message), 409);
      throw e;
    }
  });

  // GET /v1/connectors/:connector_id/auth/callback
  app.get('/v1/connectors/:connector_id/auth/callback', async (c) => {
    const connector_id = c.req.param('connector_id') as ConnectorId;
    const code = c.req.query('code') ?? '';
    const state = c.req.query('state') ?? '';
    const version = c.req.query('version') ?? '1.0.0';
    try {
      const result = await ctx.service.authCallback(connector_id, version, { connection_id: '', code, state });
      return c.json(result, 200);
    } catch (e) {
      if (e instanceof AuthStateMismatchError) return c.json(errorEnvelope(e.code, e.message), 400);
      throw e;
    }
  });

  // POST /v1/connectors/:connector_id/ping
  app.post('/v1/connectors/:connector_id/ping', async (c) => {
    const connector_id = c.req.param('connector_id') as ConnectorId;
    const body = await c.req.json<{ version: string; connection_id: string; tenant_id: string }>();
    try {
      const result = await ctx.service.ping(connector_id, body.version, body.connection_id, body.tenant_id);
      return c.json(result, 200);
    } catch (e) {
      if (e instanceof ConnectorNotFoundError) return c.json(errorEnvelope(e.code, e.message), 404);
      if (e instanceof AdapterVersionMismatchError) return c.json(errorEnvelope(e.code, e.message), 409);
      ctx.metrics?.recordError(connector_id);
      throw e;
    }
  });

  // POST /v1/connectors/:connector_id/discover
  app.post('/v1/connectors/:connector_id/discover', async (c) => {
    const connector_id = c.req.param('connector_id') as ConnectorId;
    const body = await c.req.json<{ version: string; connection_id: string; tenant_id: string; tables?: string[] }>();
    try {
      const spec: { connection_id: string; tables?: string[] } = { connection_id: body.connection_id };
      if (body.tables !== undefined) spec.tables = body.tables;
      const result = await ctx.service.discover(connector_id, body.version, body.connection_id, body.tenant_id, spec);
      return c.json(result, 200);
    } catch (e) {
      if (e instanceof ConnectorNotFoundError) return c.json(errorEnvelope(e.code, e.message), 404);
      if (e instanceof AdapterVersionMismatchError) return c.json(errorEnvelope(e.code, e.message), 409);
      throw e;
    }
  });

  // POST /v1/connectors/:connector_id/query
  app.post('/v1/connectors/:connector_id/query', async (c) => {
    const connector_id = c.req.param('connector_id') as ConnectorId;
    const body = await c.req.json<{ version: string; connection_id: string; tenant_id: string; sql: string; params?: unknown[]; max_rows?: number; cursor?: string }>();
    try {
      const spec: { connection_id: string; sql: string; params?: readonly unknown[]; max_rows?: number; cursor?: string } = {
        connection_id: body.connection_id,
        sql: body.sql,
      };
      if (body.params !== undefined) spec.params = body.params;
      if (body.max_rows !== undefined) spec.max_rows = body.max_rows;
      if (body.cursor !== undefined) spec.cursor = body.cursor;
      const result = await ctx.service.query(connector_id, body.version, body.connection_id, body.tenant_id, spec);
      return c.json(result, 200);
    } catch (e) {
      if (e instanceof ConnectorNotFoundError) return c.json(errorEnvelope(e.code, e.message), 404);
      if (e instanceof AdapterVersionMismatchError) return c.json(errorEnvelope(e.code, e.message), 409);
      ctx.metrics?.recordError(connector_id);
      throw e;
    }
  });

  // POST /v1/connectors/:connector_id/subscribe
  app.post('/v1/connectors/:connector_id/subscribe', async (c) => {
    const connector_id = c.req.param('connector_id') as ConnectorId;
    const body = await c.req.json<{ version: string; connection_id: string; tenant_id: string; table: string; cursor?: string }>();
    try {
      const spec: { connection_id: string; table: string; cursor?: string } = {
        connection_id: body.connection_id,
        table: body.table,
      };
      if (body.cursor !== undefined) spec.cursor = body.cursor;
      const result = await ctx.service.subscribe(connector_id, body.version, body.connection_id, body.tenant_id, spec);
      return c.json(result, 200);
    } catch (e) {
      if (e instanceof ConnectorNotFoundError) return c.json(errorEnvelope(e.code, e.message), 404);
      if (e instanceof AdapterVersionMismatchError) return c.json(errorEnvelope(e.code, e.message), 409);
      throw e;
    }
  });

  // POST /v1/connectors/:connector_id/invalidate
  app.post('/v1/connectors/:connector_id/invalidate', async (c) => {
    const connector_id = c.req.param('connector_id') as ConnectorId;
    const body = await c.req.json<{ version: string; connection_id: string; tenant_id: string }>();
    try {
      await ctx.service.write(connector_id, body.version, body.connection_id, body.tenant_id, {
        connection_id: body.connection_id,
        op: 'delete',
        table: '',
        rows: [],
        columns: [],
      });
      return c.json({ invalidated: true, connector_id }, 200);
    } catch (e) {
      if (e instanceof ConnectorNotFoundError) return c.json(errorEnvelope(e.code, e.message), 404);
      if (e instanceof AdapterVersionMismatchError) return c.json(errorEnvelope(e.code, e.message), 409);
      throw e;
    }
  });

  // GET /v1/connectors — list registry
  app.get('/v1/connectors', (c) => {
    const connectors = ctx.service.listConnectors();
    return c.json({ connectors }, 200);
  });

  return app;
}
