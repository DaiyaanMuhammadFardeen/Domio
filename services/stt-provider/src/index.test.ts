import { describe, expect, it } from 'vitest';
import { StubSttProvider } from './index.js';

describe('stt-provider', () => {
  it('stub transcribes', async () => {
    const p = new StubSttProvider();
    const r = await p.transcribe({
      workspace_id: 'w1',
      session_id: 's1',
      audio: new Uint8Array(16000),
      language_hint: 'en',
      sample_rate_hz: 16000,
    });
    expect(r.text).toContain('stub');
    expect(r.duration_ms).toBe(1000);
    expect(r.language).toBe('en');
  });
});
