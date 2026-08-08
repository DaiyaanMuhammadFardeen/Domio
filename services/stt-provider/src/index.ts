/**
 * @domio/stt-provider — speech-to-text provider.
 *
 * Phase 16 W9. The interface accepts a chunk of audio (PCM 16k) plus
 * a language hint and returns a transcript. `StubSttProvider` echoes
 * the input for tests; production wires Deepgram.
 */

export interface SttRequest {
  readonly workspace_id: string;
  readonly session_id: string;
  readonly audio: Uint8Array;
  readonly language_hint: string;
  readonly sample_rate_hz: number;
}

export interface SttTranscript {
  readonly text: string;
  readonly language: string;
  readonly confidence: number;
  readonly duration_ms: number;
}

export interface SttProvider {
  transcribe(req: SttRequest): Promise<SttTranscript>;
}

export class StubSttProvider implements SttProvider {
  async transcribe(req: SttRequest): Promise<SttTranscript> {
    return {
      text: '[stub] ' + req.audio.length + ' samples @ ' + req.sample_rate_hz + 'Hz',
      language: req.language_hint,
      confidence: 1,
      duration_ms: Math.round((req.audio.length / req.sample_rate_hz) * 1000),
    };
  }
}
