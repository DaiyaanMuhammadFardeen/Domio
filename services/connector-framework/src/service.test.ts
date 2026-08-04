/**
 * Connector service + Hono handler tests (Phase 08).
 *
 * Tests the HTTP handler layer: /v1/connectors/:id endpoints,
 * error handling, and auth flows.
 */

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { createConnectorHandlers } from './handlers.js';
import { ConnectorService } from './service.js';
import { AdapterRegistry } from './registry.js';
import {
  InMemoryConnectionRepository,
  InMemoryAuthStateStore,
} from './dal.js';
import { ConnectorMetrics } from './metrics.js';
import { InMemoryConnectorAuditRecorder } from './audit.js';
import type {
  ConnectorAdapter,
  ConnectorId,
  Connection,
  Transport,
  HttpRequestOpts,
  HttpResponse,
  AuthKind,
  ConnectionScope,
} from './types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

class StubTransport implements Transport {
  async request(_opts: HttpRequestOpts): Promise<HttpResponse> {
    return { status: 200, body: {} };
  }
}

function stubAdapter(
  connector_id: ConnectorId,
  version: string,
  auth_kind: AuthKind = 'oauth',
): ConnectorAdapter {
  return {
    connector_id,
    version,
    auth_kind,
    async authStart() {
      return { redirect_url: 'https://auth.example.com/start', state: 'test-state-123', scope: 'read write' };
    },
    async authCallback() {
      return { credential_ref: { vault: 'test', path: 'test/creds' } };
    },
    async ping() {
      return { ok: true, latency_ms: 42 };
    },
    async discover() {
      return {
        tables: [
          {
            name: 'test_table',
            columns: [{ name: 'id', type: 'number', semantic_role: 'id' }],
            row_count_estimate: 100,
          },
        ],
      };
    },
    async query() {
      return {
        rows: [[1, 'Alice'], [2, 'Bob']],
        columns: [
          { name: 'id', type: 'number', semantic_role: 'id' },
          { name: 'name', type: 'string', semantic_role: 'dimension' },
        ],
        stats: { duration_ms: 15, row_count: 2, source: 'live' as const },
      };
    },
    async write() {
      return { affected_rows: 1, source: 'live' as const };
    },
  };
}

function buildApp(connectorId: ConnectorId = 'google_sheets', version: string = '1.0.0') {
  const registry = new AdapterRegistry();
  registry.register(stubAdapter(connectorId, version));

  const connections = new InMemoryConnectionRepository();
  const authStates = new InMemoryAuthStateStore();
  const transport = new StubTransport();
  const metrics = new ConnectorMetrics();
  const audit = new InMemoryConnectorAuditRecorder(() => 'audit-1', () => new Date());

  // Seed a connection
  const conn: Connection & { credential_ref: { vault: string; path: string } } = {
    id: 'conn-1',
    tenant_id: 'tenant-1',
    owner_id: 'owner-1',
    connector_id: connectorId,
    connector_ver: version,
    label: 'Test Connection',
    scope: 'personal' as ConnectionScope,
    created_at: new Date(),
    credential_ref: { vault: 'test', path: 'test/creds' },
  };
  // Insert is sync via in-memory
  connections.insert(conn);

  const service = new ConnectorService({
    registry,
    connections,
    authStates,
    transport,
    metrics,
    audit,
  });

  const app = new Hono();
  app.route('/', createConnectorHandlers({ service, metrics }));

  return { app, service, connections, authStates };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ConnectorService HTTP handlers', () => {
  describe('POST /v1/connectors/:connector_id/auth/start', () => {
    it('returns 200 with redirect_url', async () => {
      const { app } = buildApp();
      const res = await app.request('/v1/connectors/google_sheets/auth/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: '1.0.0', tenant_id: 'tenant-1' }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.redirect_url).toBeTruthy();
      expect(body.state).toBeTruthy();
      expect(body.scope).toBeTruthy();
    });

    it('returns 409 for unknown connector version', async () => {
      const { app } = buildApp();
      const res = await app.request('/v1/connectors/google_sheets/auth/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: '99.0.0', tenant_id: 'tenant-1' }),
      });

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error.code).toBe('ADAPTER_VERSION_MISMATCH');
    });
  });

  describe('GET /v1/connectors/:connector_id/auth/callback', () => {
    it('returns 200 with credential_ref', async () => {
      const { app, authStates } = buildApp();

      // First, save an auth state
      await authStates.save({
        state: 'test-state-123',
        connector_id: 'google_sheets',
        tenant_id: 'tenant-1',
        redirect_uri: undefined,
        scope: 'read',
        expires_at: new Date(Date.now() + 60000),
      });

      const res = await app.request(
        '/v1/connectors/google_sheets/auth/callback?code=test-code&state=test-state-123&version=1.0.0',
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.credential_ref).toBeTruthy();
    });

    it('returns 400 for invalid state', async () => {
      const { app } = buildApp();
      const res = await app.request(
        '/v1/connectors/google_sheets/auth/callback?code=test-code&state=invalid-state&version=1.0.0',
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('AUTH_STATE_MISMATCH');
    });
  });

  describe('POST /v1/connectors/:connector_id/ping', () => {
    it('returns 200 with latency_ms', async () => {
      const { app } = buildApp();
      const res = await app.request('/v1/connectors/google_sheets/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: '1.0.0', connection_id: 'conn-1', tenant_id: 'tenant-1' }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(typeof body.latency_ms).toBe('number');
    });

    it('returns 404 for unknown connection', async () => {
      const { app } = buildApp();
      const res = await app.request('/v1/connectors/google_sheets/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: '1.0.0', connection_id: 'nonexistent', tenant_id: 'tenant-1' }),
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.code).toBe('CONNECTOR_NOT_FOUND');
    });
  });

  describe('POST /v1/connectors/:connector_id/discover', () => {
    it('returns 200 with datasets/tables', async () => {
      const { app } = buildApp();
      const res = await app.request('/v1/connectors/google_sheets/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: '1.0.0', connection_id: 'conn-1', tenant_id: 'tenant-1' }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.tables).toBeTruthy();
      expect(body.tables.length).toBeGreaterThan(0);
      expect(body.tables[0].name).toBe('test_table');
    });

    it('returns 404 for unknown connection', async () => {
      const { app } = buildApp();
      const res = await app.request('/v1/connectors/google_sheets/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: '1.0.0', connection_id: 'nonexistent', tenant_id: 'tenant-1' }),
      });

      expect(res.status).toBe(404);
    });
  });

  describe('POST /v1/connectors/:connector_id/query', () => {
    it('returns 200 with rows', async () => {
      const { app } = buildApp();
      const res = await app.request('/v1/connectors/google_sheets/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: '1.0.0',
          connection_id: 'conn-1',
          tenant_id: 'tenant-1',
          sql: 'SELECT * FROM users',
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.rows).toBeTruthy();
      expect(body.rows.length).toBe(2);
      expect(body.columns.length).toBe(2);
      expect(body.stats.row_count).toBe(2);
    });
  });

  describe('POST /v1/connectors/:connector_id/invalidate', () => {
    it('returns 200 with invalidated', async () => {
      const { app } = buildApp('postgres', '1.0.0');
      const res = await app.request('/v1/connectors/postgres/invalidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: '1.0.0',
          connection_id: 'conn-1',
          tenant_id: 'tenant-1',
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.invalidated).toBe(true);
    });
  });

  describe('GET /v1/connectors', () => {
    it('returns 200 with connectors list', async () => {
      const { app } = buildApp();
      const res = await app.request('/v1/connectors');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.connectors).toBeTruthy();
      expect(body.connectors.length).toBeGreaterThan(0);
    });
  });

  describe('404 for unknown connector', () => {
    it('returns 409 for unregistered connector', async () => {
      const { app } = buildApp();
      const res = await app.request('/v1/connectors/unknown_connector/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: '1.0.0', connection_id: 'conn-1', tenant_id: 'tenant-1' }),
      });

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error.code).toBe('ADAPTER_VERSION_MISMATCH');
    });
  });
});
