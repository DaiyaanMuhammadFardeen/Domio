import { describe, expect, it } from 'vitest';
import { HeuristicMlModerator } from './index.js';

describe('moderation-ml', () => {
  it('allows clean text', async () => {
    const m = new HeuristicMlModerator();
    const p = await m.predict({ workspace_id: 'w1', raw_text: 'great presentation' });
    expect(p.decision).toBe('allow');
    expect(p.score).toBe(0);
  });

  it('flags single profanity', async () => {
    const m = new HeuristicMlModerator();
    const p = await m.predict({ workspace_id: 'w1', raw_text: 'this is damn fine' });
    expect(p.decision).toBe('flag');
  });

  it('blocks harassment', async () => {
    const m = new HeuristicMlModerator();
    const p = await m.predict({ workspace_id: 'w1', raw_text: 'you idiot loser moron' });
    expect(p.decision).toBe('block');
    expect(p.score).toBeGreaterThan(0.5);
  });

  it('folds NFKC + case', async () => {
    const m = new HeuristicMlModerator();
    const p = await m.predict({ workspace_id: 'w1', raw_text: 'DAMN this' });
    expect(p.decision).not.toBe('allow');
  });
});
