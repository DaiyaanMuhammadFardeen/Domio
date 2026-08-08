import { describe, expect, it } from 'vitest';
import { InMemoryBlocklistModerator } from './index.js';

describe('moderation-blocklist', () => {
  it('blocks exact-match phrases', async () => {
    const m = new InMemoryBlocklistModerator();
    m.setEntries('w1', [
      { token: 'badword', severity: 'block' },
      { token: 'skipme', severity: 'flag' },
    ]);
    const r = await m.evaluate({ workspace_id: 'w1', raw_text: 'hello badword here' });
    expect(r.decision).toBe('block');
    expect(r.matched).toContain('badword');
  });

  it('flags when only flag entries match', async () => {
    const m = new InMemoryBlocklistModerator();
    m.setEntries('w1', [{ token: 'maybe', severity: 'flag' }]);
    const r = await m.evaluate({ workspace_id: 'w1', raw_text: 'this is maybe ok' });
    expect(r.decision).toBe('flag');
  });

  it('allows clean text', async () => {
    const m = new InMemoryBlocklistModerator();
    m.setEntries('w1', [{ token: 'bad', severity: 'block' }]);
    const r = await m.evaluate({ workspace_id: 'w1', raw_text: 'totally fine' });
    expect(r.decision).toBe('allow');
    expect(r.matched).toEqual([]);
  });

  it('folds NFKC and case', async () => {
    const m = new InMemoryBlocklistModerator();
    m.setEntries('w1', [{ token: 'BadWord', severity: 'block' }]);
    const r = await m.evaluate({ workspace_id: 'w1', raw_text: 'BADWORD is here' });
    expect(r.decision).toBe('block');
  });

  it('isolates per workspace', async () => {
    const m = new InMemoryBlocklistModerator();
    m.setEntries('w1', [{ token: 'forbidden', severity: 'block' }]);
    const r = await m.evaluate({ workspace_id: 'w2', raw_text: 'forbidden' });
    expect(r.decision).toBe('allow');
  });
});
