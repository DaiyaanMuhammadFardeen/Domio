import { describe, expect, it } from 'vitest';
import { StubMtProvider } from './index.js';

describe('mt-provider', () => {
  it('stub translates', async () => {
    const p = new StubMtProvider();
    const r = await p.translate({
      workspace_id: 'w1',
      text: 'hello',
      source_lang: 'en',
      target_lang: 'es',
    });
    expect(r.text).toBe('[es] hello');
    expect(r.provider).toBe('stub');
  });
});
