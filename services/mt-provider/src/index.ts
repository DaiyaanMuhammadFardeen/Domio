/**
 * @domio/mt-provider — machine translation provider.
 *
 * Phase 16 W9. Translates text from a source language to a target.
 * Production wires DeepL (paid) and NLLB (open) with the same
 * interface; tests use the stub.
 */

export type MtProviderName = 'stub' | 'deepl' | 'google' | 'nllb';

export interface MtRequest {
  readonly workspace_id: string;
  readonly text: string;
  readonly source_lang: string;
  readonly target_lang: string;
  readonly provider?: MtProviderName;
}

export interface MtTranslation {
  readonly text: string;
  readonly source_lang: string;
  readonly target_lang: string;
  readonly provider: MtProviderName;
  readonly confidence: number;
}

export interface MtProvider {
  translate(req: MtRequest): Promise<MtTranslation>;
}

export class StubMtProvider implements MtProvider {
  async translate(req: MtRequest): Promise<MtTranslation> {
    return {
      text: `[${req.target_lang}] ${req.text}`,
      source_lang: req.source_lang,
      target_lang: req.target_lang,
      provider: 'stub',
      confidence: 1,
    };
  }
}
