import { describe, it, expect } from 'vitest';
import { buildIdentityMirror } from './clickhouse.js';
import { NullIdentityMirror } from './index.js';
import type { IdentityMirrorClient } from './clickhouse.js';

class CaptureClient implements IdentityMirrorClient {
  public calls: { sql: string; params: Record<string, unknown> }[] = [];
  async execute(sql: string, params?: Record<string, unknown>): Promise<void> {
    this.calls.push({ sql, params: params ?? {} });
  }
}

describe('buildIdentityMirror', () => {
  it('writes a viewer snapshot to viewer_identity_long', async () => {
    const client = new CaptureClient();
    const mirror = buildIdentityMirror(client);
    await mirror.writeViewer({
      viewer_id: 'v1',
      workspace_id: 'ws-1',
      viewer_id_key: 'k-1',
      privacy_mode: 'pseudonymous',
      region_pinned: 'eu',
      created_at: 0,
      last_seen_at: 1_700_000_000_000,
      canonical_id: null,
      metadata: {},
    });
    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]?.sql).toMatch(/INSERT INTO viewer_identity_long/);
    expect(client.calls[0]?.params?.['workspace_id']).toBe('ws-1');
    expect(client.calls[0]?.params?.['viewer_id_key']).toBe('k-1');
    expect(client.calls[0]?.params?.['region_pinned']).toBe('eu');
  });

  it('translates grant action to granted enum and revoke to withdrawn', async () => {
    const client = new CaptureClient();
    const mirror = buildIdentityMirror(client);
    await mirror.writeConsent({
      event_id: 'e1',
      workspace_id: 'ws-1',
      viewer_id: 'v1',
      privacy_mode: 'identified',
      action: 'revoke',
      source: 'gdpr',
      policy_version: 'phase17-w3-v1',
      user_agent: null,
      ip_class: null,
      occurred_at: 1_700_000_000_000,
    });
    expect(client.calls[0]?.sql).toMatch(/INSERT INTO consent_events/);
    expect(client.calls[0]?.params?.['action']).toBe('withdrawn');
  });

  it('writes a tombstone and an ALTER DELETE on erasure', async () => {
    const client = new CaptureClient();
    const mirror = buildIdentityMirror(client);
    await mirror.eraseViewer('ws-1', 'k-1');
    expect(client.calls).toHaveLength(2);
    expect(client.calls[0]?.sql).toMatch(/INSERT INTO viewer_tombstone/);
    expect(client.calls[0]?.params?.['reason']).toBe('gdpr_erasure');
    expect(client.calls[1]?.sql).toMatch(/ALTER TABLE viewer_identity_long DELETE/);
    expect(client.calls[1]?.params?.['viewer_id_key']).toBe('k-1');
  });

  it('NullIdentityMirror is a drop-in no-op', async () => {
    const mirror = new NullIdentityMirror();
    await expect(mirror.writeViewer({
      viewer_id: '',
      workspace_id: '',
      viewer_id_key: '',
      privacy_mode: 'pseudonymous',
      region_pinned: null,
      created_at: 0,
      last_seen_at: 0,
      canonical_id: null,
      metadata: {},
    })).resolves.toBeUndefined();
    await expect(mirror.eraseViewer('a', 'b')).resolves.toBeUndefined();
  });
});