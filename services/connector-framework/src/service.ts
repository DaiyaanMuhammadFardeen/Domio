/**
 * Connector framework — service (Phase 08).
 *
 * Transport-agnostic service that wraps adapters, handles auth flows,
 * ping, discover, query, subscribe, and write.
 */

import type {
  ConnectorAdapter,
  ConnectorId,
  AdapterContext,
  AuthStartSpec,
  AuthStartResult,
  AuthCallbackSpec,
  AuthCallbackResult,
  DiscoverSpec,
  DiscoverResult,
  QuerySpec,
  QueryResult,
  WriteSpec,
  WriteResult,
  SubscribeSpec,
  SubscribeResult,
  Connection,
  Transport,
} from './types.js';
import { AuthStateMismatchError, ConnectorNotFoundError } from './types.js';
import type { AdapterRegistry } from './registry.js';
import type { ConnectorMetrics } from './metrics.js';
import type { ConnectorAuditRecorder } from './audit.js';
import type { AuthStateStore, ConnectionRepository, ConnectionRecord } from './dal.js';

export interface ConnectorServiceOptions {
  readonly registry: AdapterRegistry;
  readonly connections: ConnectionRepository;
  readonly authStates: AuthStateStore;
  readonly transport: Transport;
  readonly metrics: ConnectorMetrics | undefined;
  readonly audit: ConnectorAuditRecorder | undefined;
}

export class ConnectorService {
  private readonly registry: AdapterRegistry;
  private readonly connections: ConnectionRepository;
  private readonly authStates: AuthStateStore;
  private readonly transport: Transport;
  private readonly metrics: ConnectorMetrics | undefined;
  private readonly audit: ConnectorAuditRecorder | undefined;

  constructor(opts: ConnectorServiceOptions) {
    this.registry = opts.registry;
    this.connections = opts.connections;
    this.authStates = opts.authStates;
    this.transport = opts.transport;
    this.metrics = opts.metrics;
    this.audit = opts.audit;
  }

  private resolveAdapter(connector_id: ConnectorId, version: string): ConnectorAdapter {
    const registered = this.registry.resolve(connector_id, version);
    return registered.adapter;
  }

  private buildContext(conn: ConnectionRecord): AdapterContext {
    return {
      tenant_id: conn.tenant_id,
      owner_id: conn.owner_id,
      connection: conn,
      credential: conn.credential_ref,
      transport: this.transport,
    };
  }

  async authStart(
    connector_id: ConnectorId,
    version: string,
    tenant_id: string,
    spec: AuthStartSpec,
  ): Promise<AuthStartResult> {
    const adapter = this.resolveAdapter(connector_id, version);
    // Create a placeholder connection for auth context
    const placeholderConn: Connection = {
      id: `auth_${Date.now()}`,
      tenant_id,
      owner_id: '',
      connector_id,
      connector_ver: version,
      label: '',
      scope: 'personal',
      created_at: new Date(),
    };
    const ctx: AdapterContext = {
      tenant_id,
      owner_id: '',
      connection: placeholderConn,
      credential: { vault: 'phase-01', path: '' },
      transport: this.transport,
    };
    const result = await adapter.authStart(ctx, spec);
    // Store auth state for callback verification
    await this.authStates.save({
      state: result.state,
      connector_id,
      tenant_id,
      redirect_uri: spec.redirect_uri,
      scope: result.scope,
      expires_at: new Date(Date.now() + 10 * 60 * 1000),
    });
    return result;
  }

  async authCallback(
    connector_id: ConnectorId,
    version: string,
    spec: AuthCallbackSpec,
  ): Promise<AuthCallbackResult> {
    const stored = await this.authStates.consume(spec.state);
    if (!stored || stored.connector_id !== connector_id) {
      throw new AuthStateMismatchError();
    }
    const adapter = this.resolveAdapter(connector_id, version);
    const placeholderConn: Connection = {
      id: `auth_cb_${Date.now()}`,
      tenant_id: stored.tenant_id,
      owner_id: '',
      connector_id,
      connector_ver: version,
      label: '',
      scope: 'personal',
      created_at: new Date(),
    };
    const ctx: AdapterContext = {
      tenant_id: stored.tenant_id,
      owner_id: '',
      connection: placeholderConn,
      credential: { vault: 'phase-01', path: '' },
      transport: this.transport,
    };
    return adapter.authCallback(ctx, spec);
  }

  async ping(
    connector_id: ConnectorId,
    version: string,
    connection_id: string,
    tenant_id: string,
  ): Promise<{ ok: boolean; latency_ms: number }> {
    const conn = await this.connections.findById(connection_id, tenant_id);
    if (!conn) throw new ConnectorNotFoundError(connection_id);
    const adapter = this.resolveAdapter(connector_id, version);
    const ctx = this.buildContext(conn);
    this.metrics?.recordPing(connector_id);
    const result = await adapter.ping(ctx);
    await this.audit?.record({
      tenant_id,
      actor_id: conn.owner_id,
      action: 'ping',
      connector_id,
      payload: { connection_id, ok: result.ok, latency_ms: result.latency_ms },
    });
    return result;
  }

  async discover(
    connector_id: ConnectorId,
    version: string,
    connection_id: string,
    tenant_id: string,
    spec: DiscoverSpec,
  ): Promise<DiscoverResult> {
    const conn = await this.connections.findById(connection_id, tenant_id);
    if (!conn) throw new ConnectorNotFoundError(connection_id);
    const adapter = this.resolveAdapter(connector_id, version);
    const ctx = this.buildContext(conn);
    return adapter.discover(ctx, spec);
  }

  async query(
    connector_id: ConnectorId,
    version: string,
    connection_id: string,
    tenant_id: string,
    spec: QuerySpec,
  ): Promise<QueryResult> {
    const conn = await this.connections.findById(connection_id, tenant_id);
    if (!conn) throw new ConnectorNotFoundError(connection_id);
    const adapter = this.resolveAdapter(connector_id, version);
    const ctx = this.buildContext(conn);
    this.metrics?.recordQuery(connector_id);
    const result = await adapter.query(ctx, spec);
    await this.audit?.record({
      tenant_id,
      actor_id: conn.owner_id,
      action: 'query',
      connector_id,
      payload: { connection_id, sql: spec.sql, row_count: result.stats.row_count },
    });
    return result;
  }

  async subscribe(
    connector_id: ConnectorId,
    version: string,
    connection_id: string,
    tenant_id: string,
    spec: SubscribeSpec,
  ): Promise<SubscribeResult> {
    const conn = await this.connections.findById(connection_id, tenant_id);
    if (!conn) throw new ConnectorNotFoundError(connection_id);
    const adapter = this.resolveAdapter(connector_id, version);
    if (!adapter.subscribe) {
      return { subscription_id: '', status: 'not_implemented' };
    }
    const ctx = this.buildContext(conn);
    return adapter.subscribe(ctx, spec);
  }

  async write(
    connector_id: ConnectorId,
    version: string,
    connection_id: string,
    tenant_id: string,
    spec: WriteSpec,
  ): Promise<WriteResult> {
    const conn = await this.connections.findById(connection_id, tenant_id);
    if (!conn) throw new ConnectorNotFoundError(connection_id);
    const adapter = this.resolveAdapter(connector_id, version);
    const ctx = this.buildContext(conn);
    return adapter.write(ctx, spec);
  }

  listConnectors() {
    return this.registry.list();
  }
}
