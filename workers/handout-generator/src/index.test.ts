import { describe, expect, it } from 'vitest';
import { HandoutGenerator } from './index.js';

describe('handout-generator', () => {
  const key = new Uint8Array(32);
  const now = 1_700_000_000_000;

  it('mints a signed URL and verifies it', () => {
    const g = new HandoutGenerator({ key });
    const signed = g.mint({ workspace_id: 'w1', session_id: 's1' }, now);
    expect(signed.token.split('.')).toHaveLength(2);
    expect(signed.url).toMatch(/^https:\/\/join\.domio\.example\/h\//);
    const verified = g.verify(signed.token, now);
    expect(verified?.workspace_id).toBe('w1');
    expect(verified?.session_id).toBe('s1');
  });

  it('rejects expired tokens', () => {
    const g = new HandoutGenerator({ key });
    const signed = g.mint({ workspace_id: 'w1', session_id: 's1', ttl_ms: 1000 }, now);
    const verified = g.verify(signed.token, now + 2000);
    expect(verified).toBeNull();
  });

  it('rejects tampered tokens', () => {
    const g = new HandoutGenerator({ key });
    const signed = g.mint({ workspace_id: 'w1', session_id: 's1' }, now);
    const tampered = signed.token.slice(0, -2) + 'AA';
    const verified = g.verify(tampered, now);
    expect(verified).toBeNull();
  });

  it('rejects tokens signed with a different key', () => {
    const otherKey = new Uint8Array(32);
    otherKey[0] = 1;
    const g1 = new HandoutGenerator({ key });
    const g2 = new HandoutGenerator({ key: otherKey });
    const signed = g1.mint({ workspace_id: 'w1', session_id: 's1' }, now);
    expect(g2.verify(signed.token, now)).toBeNull();
  });
});
