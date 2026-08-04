/**
 * Connector framework — DAL (Phase 08).
 *
 * In-memory persistence for connections and adapter state.
 * Mirrors the theme service DAL pattern.
 */

import type { Connection, ConnectorId, CredentialRef } from './types.js';

// ---------------------------------------------------------------------------
// Connection records
// ---------------------------------------------------------------------------

export interface ConnectionRecord extends Connection {
  readonly credential_ref: CredentialRef;
}

// ---------------------------------------------------------------------------
// Repository interfaces
// ---------------------------------------------------------------------------

export interface ConnectionRepository {
  insert(record: ConnectionRecord): Promise<void>;
  findById(id: string, tenant_id: string): Promise<ConnectionRecord | null>;
  listByTenant(tenant_id: string, connector_id?: ConnectorId): Promise<ConnectionRecord[]>;
  delete(id: string, tenant_id: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// In-memory implementations
// ---------------------------------------------------------------------------

export class InMemoryConnectionRepository implements ConnectionRepository {
  private store = new Map<string, ConnectionRecord>();

  private k(record: ConnectionRecord): string {
    return `${record.tenant_id}::${record.id}`;
  }

  async insert(record: ConnectionRecord): Promise<void> {
    this.store.set(this.k(record), record);
  }

  async findById(id: string, tenant_id: string): Promise<ConnectionRecord | null> {
    return this.store.get(`${tenant_id}::${id}`) ?? null;
  }

  async listByTenant(tenant_id: string, connector_id?: ConnectorId): Promise<ConnectionRecord[]> {
    const out: ConnectionRecord[] = [];
    for (const r of this.store.values()) {
      if (r.tenant_id !== tenant_id) continue;
      if (connector_id && r.connector_id !== connector_id) continue;
      out.push(r);
    }
    return out;
  }

  async delete(id: string, tenant_id: string): Promise<void> {
    this.store.delete(`${tenant_id}::${id}`);
  }
}

// ---------------------------------------------------------------------------
// Auth state store (for OAuth flows)
// ---------------------------------------------------------------------------

export interface AuthStateRecord {
  readonly state: string;
  readonly connector_id: ConnectorId;
  readonly tenant_id: string;
  readonly redirect_uri: string | undefined;
  readonly scope: string;
  readonly expires_at: Date;
}

export interface AuthStateStore {
  save(record: AuthStateRecord): Promise<void>;
  consume(state: string): Promise<AuthStateRecord | null>;
}

export class InMemoryAuthStateStore implements AuthStateStore {
  private store = new Map<string, AuthStateRecord>();

  async save(record: AuthStateRecord): Promise<void> {
    this.store.set(record.state, record);
  }

  async consume(state: string): Promise<AuthStateRecord | null> {
    const record = this.store.get(state) ?? null;
    if (record) this.store.delete(state);
    return record;
  }
}
