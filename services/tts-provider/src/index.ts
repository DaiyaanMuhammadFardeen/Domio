/**
 * @domio/tts-provider — text-to-speech provider.
 *
 * Phase 16 W9. Synthesizes speech from text. Returns audio bytes
 * (PCM 16k by default) and the duration. Production wires vendor TTS.
 */

export type TtsProviderName = 'stub' | 'elevenlabs' | 'azure' | 'google';

export interface TtsRequest {
  readonly workspace_id: string;
  readonly text: string;
  readonly language: string;
  readonly voice?: string;
  readonly sample_rate_hz?: number;
  readonly provider?: TtsProviderName;
}

export interface TtsAudio {
  readonly audio: Uint8Array;
  readonly language: string;
  readonly provider: TtsProviderName;
  readonly duration_ms: number;
}

export interface TtsProvider {
  synthesize(req: TtsRequest): Promise<TtsAudio>;
}

export class StubTtsProvider implements TtsProvider {
  async synthesize(req: TtsRequest): Promise<TtsAudio> {
    // Synthesize 1 byte per character as a stand-in for audio data.
    const audio = new Uint8Array(Math.max(1, req.text.length));
    return {
      audio,
      language: req.language,
      provider: 'stub',
      duration_ms: Math.round(audio.length / (req.sample_rate_hz ?? 16000) * 1000),
    };
  }
}
