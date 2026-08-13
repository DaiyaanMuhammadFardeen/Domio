import { describe, expect, it } from 'vitest';
import { StubSttProvider } from '@domio/stt-provider';
import { StubMtProvider } from '@domio/mt-provider';
import { StubTtsProvider } from '@domio/tts-provider';
import { TranslationPipeline } from './index.js';

describe('translation-pipeline', () => {
  it('transcribes, translates, synthesizes', async () => {
    const pipe = new TranslationPipeline({
      stt: new StubSttProvider(),
      mt: new StubMtProvider(),
      tts: new StubTtsProvider(),
    });
    const out = await pipe.audioToAudio({
      workspace_id: 'w1',
      session_id: 's1',
      audio: new Uint8Array(16000),
      source_lang: 'en',
      target_lang: 'es',
      sample_rate_hz: 16000,
    });
    expect(out.text).toMatch(/\[es\]/);
    expect(out.audio).not.toBeNull();
    expect(out.providers.mt).toBe('stub');
  });

  it('text-only translate', async () => {
    const pipe = new TranslationPipeline({
      stt: new StubSttProvider(),
      mt: new StubMtProvider(),
      tts: new StubTtsProvider(),
    });
    const r = await pipe.translate({
      workspace_id: 'w1',
      text: 'hello',
      source_lang: 'en',
      target_lang: 'es',
    });
    expect(r.text).toBe('[es] hello');
  });
});
