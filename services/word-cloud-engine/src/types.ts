/**
 * @domio/word-cloud-engine — domain types.
 *
 * Phase 16 W5. Submits are tokenized server-side (NFKC, lowercased,
 * stopword-stripped). Each token contributes one count. Optional
 * `moderation` field captures a moderation decision from
 * @domio/moderation-blocklist or @domio/moderation-ml.
 */

export type WordCloudStatus = 'draft' | 'open' | 'closed' | 'archived';
export type ModerationDecision = 'allow' | 'flag' | 'block';

export interface WordCloud {
  readonly id: string;
  readonly workspace_id: string;
  readonly session_id: string;
  readonly widget_id: string;
  readonly prompt: string;
  readonly status: WordCloudStatus;
  readonly allow_repeat: boolean;
  readonly stopwords: ReadonlyArray<string>;
  readonly max_chars: number;
  readonly created_by: string;
  readonly created_at_ms: number;
  readonly updated_at_ms: number;
  readonly version: number;
}

export interface WordCloudSubmit {
  readonly id: string;
  readonly workspace_id: string;
  readonly session_id: string;
  readonly cloud_id: string;
  readonly participant_id: string;
  readonly raw_text: string;
  readonly tokens: ReadonlyArray<string>;
  readonly moderation: ModerationDecision | null;
  readonly submitted_at_ms: number;
  readonly idempotency_key: string;
}

export interface WordCloudAggregate {
  readonly cloud_id: string;
  readonly counts: Readonly<Record<string, number>>;
  readonly total: number;
  readonly computed_at_ms: number;
}

export class WordCloudError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'WordCloudError';
  }
}
