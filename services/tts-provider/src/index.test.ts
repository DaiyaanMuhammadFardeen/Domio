import { describe, expect, it } from 'vitest';
import { StubTtsProvider } from './index.js';

describe('tts-provider', () => {
  it('stub synthesizes', async () => {
    const p = new StubTtsProvider();
    const r = await p.synthesize({ workspace_id: 'w1', text: 'hello', language: 'en' });
    expect(r.audio.length).toBe(5);
    expect(r.provider).toBe('stub');
  });
});
