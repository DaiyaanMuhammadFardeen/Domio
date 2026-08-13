/**
 * @domio/translation-pipeline — STT → MT → TTS orchestration.
 *
 * Phase 16 W9. Receives audio (or text) and produces translated audio
 * (or text). The three providers are independent and pluggable.
 */

import type { SttProvider } from '@domio/stt-provider';
import type { MtProvider } from '@domio/mt-provider';
import type { TtsProvider } from '@domio/tts-provider';

export interface TranslationPipelineOptions {
  readonly stt: SttProvider;
  readonly mt: MtProvider;
  readonly tts: TtsProvider;
}

export interface AudioInput {
  readonly workspace_id: string;
  readonly session_id: string;
  readonly audio: Uint8Array;
  readonly source_lang: string;
  readonly target_lang: string;
  readonly sample_rate_hz: number;
}

export interface TextInput {
  readonly workspace_id: string;
  readonly text: string;
  readonly source_lang: string;
  readonly target_lang: string;
}

export interface PipelineOutput {
  readonly text: string;
  readonly audio: Uint8Array | null;
  readonly duration_ms: number;
  readonly providers: { stt?: string; mt: string; tts?: string };
}

export class TranslationPipeline {
  private readonly stt: SttProvider;
  private readonly mt: MtProvider;
  private readonly tts: TtsProvider;

  constructor(opts: TranslationPipelineOptions) {
    this.stt = opts.stt;
    this.mt = opts.mt;
    this.tts = opts.tts;
  }

  async transcribe(input: {
    workspace_id: string;
    audio: Uint8Array;
    source_lang: string;
    sample_rate_hz: number;
  }): Promise<{ text: string; language: string; duration_ms: number }> {
    const r = await this.stt.transcribe({
      workspace_id: input.workspace_id,
      session_id: 'inline',
      audio: input.audio,
      language_hint: input.source_lang,
      sample_rate_hz: input.sample_rate_hz,
    });
    return { text: r.text, language: r.language, duration_ms: r.duration_ms };
  }

  async translate(input: TextInput): Promise<{ text: string; provider: string }> {
    const r = await this.mt.translate({
      workspace_id: input.workspace_id,
      text: input.text,
      source_lang: input.source_lang,
      target_lang: input.target_lang,
    });
    return { text: r.text, provider: r.provider };
  }

  async synthesize(input: {
    workspace_id: string;
    text: string;
    language: string;
  }): Promise<{ audio: Uint8Array; duration_ms: number; provider: string }> {
    const r = await this.tts.synthesize({
      workspace_id: input.workspace_id,
      text: input.text,
      language: input.language,
    });
    return { audio: r.audio, duration_ms: r.duration_ms, provider: r.provider };
  }

  async audioToAudio(input: AudioInput): Promise<PipelineOutput> {
    const transcript = await this.transcribe({
      workspace_id: input.workspace_id,
      audio: input.audio,
      source_lang: input.source_lang,
      sample_rate_hz: input.sample_rate_hz,
    });
    const translated = await this.translate({
      workspace_id: input.workspace_id,
      text: transcript.text,
      source_lang: input.source_lang,
      target_lang: input.target_lang,
    });
    const tts = await this.synthesize({
      workspace_id: input.workspace_id,
      text: translated.text,
      language: input.target_lang,
    });
    return {
      text: translated.text,
      audio: tts.audio,
      duration_ms: tts.duration_ms,
      providers: { mt: translated.provider, tts: tts.provider },
    };
  }
}
