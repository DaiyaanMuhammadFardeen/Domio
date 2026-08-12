/**
 * Connector service — Wave 2 §S2.7 unit tests.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  formatLastSynced,
  getConnector,
  listConnectors,
  refreshRemoteSource,
  registerSource,
  removeRemoteSource,
  validateCredentials,
} from './connector-service';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('connector-service', () => {
  it('listConnectors returns the full catalog', () => {
    const all = listConnectors();
    const kinds = all.map((c) => c.kind);
    expect(kinds).toContain('sheets');
    expect(kinds).toContain('postgres');
    expect(kinds).toContain('bigquery');
    expect(kinds).toContain('graphql');
    expect(kinds).toContain('mock');
  });

  it('getConnector returns the descriptor for a known kind', () => {
    const pg = getConnector('postgres');
    expect(pg?.label).toBe('PostgreSQL');
    expect(pg?.authType).toBe('connection-string');
  });

  it('getConnector returns undefined for an unknown kind', () => {
    expect(getConnector('unknown' as unknown as 'mock')).toBeUndefined();
  });

  it('validateCredentials flags missing required fields', () => {
    const pg = getConnector('postgres')!;
    const out = validateCredentials(pg, {});
    expect(out.ok).toBe(false);
    expect(out.missing).toContain('Connection string');
  });

  it('validateCredentials passes when all required fields are present', () => {
    const pg = getConnector('postgres')!;
    const out = validateCredentials(pg, { connectionString: 'postgres://localhost' });
    expect(out.ok).toBe(true);
    expect(out.missing).toEqual([]);
  });

  it('registerSource hits the remote when reachable and returns the response', async () => {
    const remote = {
      id: 'remote-1',
      kind: 'mock' as const,
      name: 'Mock',
      rowCount: 24,
      lastSyncedAtMs: 1234,
      columns: [],
    };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => remote,
    }) as unknown as typeof fetch;
    const out = await registerSource({
      kind: 'mock',
      name: 'Mock',
      credentials: { rows: '50' },
    });
    expect(out).toEqual(remote);
  });

  it('registerSource falls back to a bootstrap mock source when offline', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    const out = await registerSource({
      kind: 'mock',
      name: 'Offline',
      credentials: { rows: '10', seed: '7' },
    });
    expect(out.kind).toBe('mock');
    expect(out.name).toBe('Offline');
    expect(out.rowCount).toBeGreaterThan(0);
    expect(out.lastSyncedAtMs).toBeGreaterThan(0);
  });

  it('refreshRemoteSource returns a fresh timestamp when offline', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    const out = await refreshRemoteSource('source-1');
    expect(out.id).toBe('source-1');
    expect(out.lastSyncedAtMs).toBeGreaterThan(0);
  });

  it('removeRemoteSource returns silently when offline', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    await expect(removeRemoteSource('source-1')).resolves.toBeUndefined();
  });

  it('formatLastSynced returns "0s ago" for now', () => {
    expect(formatLastSynced(Date.now())).toBe('0s ago');
  });

  it('formatLastSynced returns minutes for older timestamps', () => {
    const t = Date.now() - 5 * 60 * 1000;
    expect(formatLastSynced(t)).toBe('5m ago');
  });

  it('formatLastSynced returns hours for older timestamps', () => {
    const t = Date.now() - 3 * 60 * 60 * 1000;
    expect(formatLastSynced(t)).toBe('3h ago');
  });

  it('formatLastSynced returns days for very old timestamps', () => {
    const t = Date.now() - 2 * 24 * 60 * 60 * 1000;
    expect(formatLastSynced(t)).toBe('2d ago');
  });
});