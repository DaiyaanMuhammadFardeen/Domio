/**
 * Adapter registry tests (Phase 08).
 */

import { describe, it, expect } from 'vitest';
import { AdapterRegistry } from './registry.js';
import type { ConnectorAdapter, ConnectorId, AuthKind } from './types.js';
import { AdapterVersionMismatchError } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stubAdapter(
  connector_id: ConnectorId,
  version: string,
  auth_kind: AuthKind = 'oauth',
): ConnectorAdapter {
  return {
    connector_id,
    version,
    auth_kind,
    async authStart() { return { redirect_url: '', state: '', scope: '' }; },
    async authCallback() { return { credential_ref: { vault: '', path: '' } }; },
    async ping() { return { ok: true, latency_ms: 0 }; },
    async discover() { return { tables: [] }; },
    async query() { return { rows: [], columns: [], stats: { duration_ms: 0, row_count: 0, source: 'live' } }; },
    async write() { return { affected_rows: 0, source: 'live' }; },
  };
}

const ALL_CONNECTORS: ConnectorId[] = [
  'google_sheets', 'excel', 'airtable', 'notion',
  'postgres', 'mysql', 'bigquery', 'snowflake', 'rest', 'graphql',
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AdapterRegistry', () => {
  it('registers and resolves 10 connectors', () => {
    const reg = new AdapterRegistry();
    for (const id of ALL_CONNECTORS) {
      reg.register(stubAdapter(id, '1.0.0'));
    }
    for (const id of ALL_CONNECTORS) {
      const resolved = reg.resolve(id, '1.0.0');
      expect(resolved.connector_id).toBe(id);
      expect(resolved.version).toBe('1.0.0');
    }
  });

  it('resolve honors connector_ver pin (exact match)', () => {
    const reg = new AdapterRegistry();
    reg.register(stubAdapter('postgres', '1.0.0'));
    reg.register(stubAdapter('postgres', '1.1.0'));
    reg.register(stubAdapter('postgres', '1.2.0'));

    expect(reg.resolve('postgres', '1.0.0').version).toBe('1.0.0');
    expect(reg.resolve('postgres', '1.1.0').version).toBe('1.1.0');
    expect(reg.resolve('postgres', '1.2.0').version).toBe('1.2.0');
  });

  it('two versions registered, pin resolves the exact one', () => {
    const reg = new AdapterRegistry();
    reg.register(stubAdapter('notion', '1.0.0'));
    reg.register(stubAdapter('notion', '2.0.0'));

    const v1 = reg.resolve('notion', '1.0.0');
    const v2 = reg.resolve('notion', '2.0.0');
    expect(v1.version).toBe('1.0.0');
    expect(v2.version).toBe('2.0.0');
    expect(v1).not.toBe(v2);
  });

  it('unknown connector throws AdapterVersionMismatchError', () => {
    const reg = new AdapterRegistry();
    reg.register(stubAdapter('google_sheets', '1.0.0'));

    expect(() => reg.resolve('postgres', '1.0.0')).toThrow(AdapterVersionMismatchError);
    try {
      reg.resolve('postgres', '1.0.0');
    } catch (e) {
      expect(e).toBeInstanceOf(AdapterVersionMismatchError);
      const err = e as AdapterVersionMismatchError;
      expect(err.code).toBe('ADAPTER_VERSION_MISMATCH');
      expect(err.connector_id).toBe('postgres');
      expect(err.available_versions).toEqual([]);
    }
  });

  it('unknown version for registered connector throws with available versions', () => {
    const reg = new AdapterRegistry();
    reg.register(stubAdapter('rest', '1.0.0'));
    reg.register(stubAdapter('rest', '1.2.0'));

    try {
      reg.resolve('rest', '2.0.0');
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(AdapterVersionMismatchError);
      const err = e as AdapterVersionMismatchError;
      expect(err.available_versions).toEqual(['1.0.0', '1.2.0']);
    }
  });

  it('deprecation policy: deprecated version resolves with deprecation flag', () => {
    const reg = new AdapterRegistry();
    reg.register(stubAdapter('bigquery', '1.0.0'), {
      deprecated: true,
      deprecated_since: '2024-06-01',
      replaced_by: '2.0.0',
    });
    reg.register(stubAdapter('bigquery', '2.0.0'));

    const v1 = reg.resolve('bigquery', '1.0.0');
    expect(v1.deprecated).toBe(true);
    expect(v1.deprecated_since).toBe('2024-06-01');
    expect(v1.replaced_by).toBe('2.0.0');

    const v2 = reg.resolve('bigquery', '2.0.0');
    expect(v2.deprecated).toBe(false);
    expect(v2.replaced_by).toBeUndefined();
  });

  it('caret range resolves latest compatible version', () => {
    const reg = new AdapterRegistry();
    reg.register(stubAdapter('airtable', '1.0.0'));
    reg.register(stubAdapter('airtable', '1.3.0'));
    reg.register(stubAdapter('airtable', '2.0.0'));

    const resolved = reg.resolve('airtable', '^1.0.0');
    expect(resolved.version).toBe('1.3.0');
  });

  it('caret range throws when no compatible version exists', () => {
    const reg = new AdapterRegistry();
    reg.register(stubAdapter('airtable', '2.0.0'));

    expect(() => reg.resolve('airtable', '^1.0.0')).toThrow(AdapterVersionMismatchError);
  });

  it('versions() returns version info sorted ascending', () => {
    const reg = new AdapterRegistry();
    reg.register(stubAdapter('excel', '2.0.0'));
    reg.register(stubAdapter('excel', '1.0.0'));
    reg.register(stubAdapter('excel', '1.5.0'));

    const versions = reg.versions('excel');
    expect(versions).toHaveLength(3);
    expect(versions.map((v) => v.version)).toEqual(['1.0.0', '1.5.0', '2.0.0']);
  });

  it('list() returns all registered adapters', () => {
    const reg = new AdapterRegistry();
    reg.register(stubAdapter('google_sheets', '1.0.0'));
    reg.register(stubAdapter('rest', '1.0.0'));
    reg.register(stubAdapter('rest', '2.0.0'));

    const all = reg.list();
    expect(all).toHaveLength(3);
  });

  it('has() returns false for unregistered connector', () => {
    const reg = new AdapterRegistry();
    expect(reg.has('snowflake')).toBe(false);
    reg.register(stubAdapter('snowflake', '1.0.0'));
    expect(reg.has('snowflake')).toBe(true);
  });

  it('register replaces adapter at same version', () => {
    const reg = new AdapterRegistry();
    reg.register(stubAdapter('graphql', '1.0.0'));
    reg.register(stubAdapter('graphql', '1.0.0'));

    const all = reg.list();
    expect(all).toHaveLength(1);
    expect(reg.resolve('graphql', '1.0.0')).toBeDefined();
  });
});
