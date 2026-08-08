/**
 * @domio/moderation-flagger — async moderation backstop.
 *
 * Phase 16 W9. Synchronous moderation (blocklist, ML) runs in the
 * engine's request path. The flagger is the backstop: it consumes
 * `flag`-rated submits after the session ends, reruns ML with a
 * higher-quality model, and persists final decisions.
 */

export type ModerationDecision = 'allow' | 'flag' | 'block';

export interface Subject {
  readonly workspace_id: string;
  readonly session_id: string;
  readonly subject_kind: 'word_cloud_submit' | 'qa_submit' | 'poll_label';
  readonly subject_id: string;
  readonly raw_text: string;
}

export interface Decision {
  readonly subject_id: string;
  readonly decision: ModerationDecision;
  readonly source: 'blocklist' | 'ml' | 'manual';
  readonly reason: string | null;
  readonly decided_at_ms: number;
}

export interface MlPredictor {
  predict(input: { workspace_id: string; raw_text: string }): Promise<{ decision: ModerationDecision; score: number }>;
}

export interface FlaggerStore {
  record(decision: Decision & { workspace_id: string; session_id: string; subject_kind: Subject['subject_kind'] }): Promise<void>;
  list(input: { workspace_id: string; session_id: string }): Promise<ReadonlyArray<Decision & { subject_kind: Subject['subject_kind'] }>>;
}

export class InMemoryFlaggerStore implements FlaggerStore {
  private readonly rows: Array<Decision & { workspace_id: string; session_id: string; subject_kind: Subject['subject_kind'] }> = [];
  async record(d: Decision & { workspace_id: string; session_id: string; subject_kind: Subject['subject_kind'] }): Promise<void> {
    this.rows.push(d);
  }
  async list(input: { workspace_id: string; session_id: string }): Promise<ReadonlyArray<Decision & { subject_kind: Subject['subject_kind'] }>> {
    return this.rows.filter((r) => r.workspace_id === input.workspace_id && r.session_id === input.session_id);
  }
}

export class ModerationFlagger {
  constructor(
    private readonly ml: MlPredictor,
    private readonly store: FlaggerStore,
    private readonly now_ms: () => number = () => Date.now(),
  ) {}

  async process(input: Subject): Promise<Decision> {
    const p = await this.ml.predict({ workspace_id: input.workspace_id, raw_text: input.raw_text });
    const decision: Decision = {
      subject_id: input.subject_id,
      decision: p.decision,
      source: 'ml',
      reason: p.score > 0 ? `score=${p.score.toFixed(2)}` : null,
      decided_at_ms: this.now_ms(),
    };
    await this.store.record({
      ...decision,
      workspace_id: input.workspace_id,
      session_id: input.session_id,
      subject_kind: input.subject_kind,
    });
    return decision;
  }
}