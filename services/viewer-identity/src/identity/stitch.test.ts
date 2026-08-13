import { describe, it, expect } from 'vitest';
import { stitchViewer } from './stitch.js';
import type { ViewerRecord } from '../types.js';

function v(id: string, opts: Partial<ViewerRecord> = {}): ViewerRecord {
  return {
    viewer_id: id,
    workspace_id: 'ws-1',
    viewer_id_key: `key-${id}`,
    privacy_mode: 'pseudonymous',
    region_pinned: null,
    created_at: 0,
    last_seen_at: 0,
    canonical_id: null,
    metadata: {},
    ...opts,
  };
}

describe('stitchViewer', () => {
  it('email-hash match wins over IP/UA heuristics', () => {
    const a = v('a', { metadata: { email_hash: 'h1' } });
    const b = v('b', {
      metadata: { email_hash: 'h1', last_ip_class: 'eu', last_user_agent: 'ua' },
    });
    const out = stitchViewer({
      workspace_id: 'ws-1',
      viewer: a,
      candidates: [b],
      context: { email_hash: 'h1', ip_class: 'eu', user_agent: 'ua', now_ms: 1000 },
    });
    expect(out.method).toBe('email_hash');
    expect(out.confidence).toBeGreaterThanOrEqual(0.99);
    expect(out.link?.canonical_id).toBeDefined();
    expect(out.link?.alternate_id).toBeDefined();
  });

  it('skips self-matches', () => {
    const a = v('a');
    const out = stitchViewer({
      workspace_id: 'ws-1',
      viewer: a,
      candidates: [a],
      context: { ip_class: 'eu', user_agent: 'ua', now_ms: 0 },
    });
    expect(out.link).toBeNull();
  });

  it('requires same workspace', () => {
    const a = v('a', { workspace_id: 'ws-1' });
    const b = v('b', { workspace_id: 'ws-2', metadata: { email_hash: 'h1' } });
    const out = stitchViewer({
      workspace_id: 'ws-1',
      viewer: a,
      candidates: [b],
      context: { email_hash: 'h1', now_ms: 0 },
    });
    expect(out.link).toBeNull();
  });

  it('falls back to last_seen_ip when email hash absent', () => {
    const a = v('a', { last_seen_at: 0, metadata: { last_ip_class: 'bd' } });
    const b = v('b', { last_seen_at: 1000, metadata: { last_ip_class: 'bd' } });
    const out = stitchViewer({
      workspace_id: 'ws-1',
      viewer: a,
      candidates: [b],
      context: { ip_class: 'bd', now_ms: 60 * 1000 },
    });
    expect(out.method).toBe('last_seen_ip');
    expect(out.confidence).toBe(0.6);
  });

  it('does not stitch when ip_class is too old (>24h)', () => {
    const a = v('a', { last_seen_at: 0 });
    const b = v('b', { last_seen_at: 0, metadata: { last_ip_class: 'eu' } });
    const out = stitchViewer({
      workspace_id: 'ws-1',
      viewer: a,
      candidates: [b],
      context: { ip_class: 'eu', now_ms: 25 * 3600 * 1000 },
    });
    expect(out.link).toBeNull();
  });
});
