/**
 * @domio/moderation-ml — pluggable ML moderation.
 *
 * Phase 16 W5. The `MlModerator` interface lets the engine swap in any
 * detector — Detoxify, a hosted API, etc. The default
 * `HeuristicMlModerator` provides a deterministic fallback used in tests
 * and offline builds. The ML hook is consulted *after* the blocklist;
 * whichever is stricter wins.
 */

export type ModerationDecision = 'allow' | 'flag' | 'block';

export interface MlPrediction {
  readonly decision: ModerationDecision;
  readonly score: number;
  readonly categories: Readonly<Record<string, number>>;
}

export interface MlModerator {
  predict(input: { workspace_id: string; raw_text: string }): Promise<MlPrediction>;
}

export interface HeuristicOptions {
  /** Threshold above which the text is blocked. */
  readonly block_threshold?: number;
  /** Threshold above which the text is flagged. */
  readonly flag_threshold?: number;
}

const PROFANITY = ['damn', 'hell', 'crap'];
const HARASSMENT = ['idiot', 'loser', 'moron'];

/** Deterministic ML moderation. Scores by counting category hits
 *  and scaling. Predictable for tests; replace with a real model in
 *  production. */
export class HeuristicMlModerator implements MlModerator {
  private readonly block_threshold: number;
  private readonly flag_threshold: number;

  constructor(opts: HeuristicOptions = {}) {
    this.block_threshold = opts.block_threshold ?? 0.6;
    this.flag_threshold = opts.flag_threshold ?? 0.2;
  }

  async predict(input: { workspace_id: string; raw_text: string }): Promise<MlPrediction> {
    void input.workspace_id;
    const normalized = input.raw_text.normalize('NFKC').toLowerCase();
    const tokens = normalized.split(/\s+/).filter(Boolean);
    let profanity = 0;
    let harassment = 0;
    for (const t of tokens) {
      if (PROFANITY.includes(t)) profanity += 1;
      if (HARASSMENT.includes(t)) harassment += 1;
    }
    const score = Math.min(1, profanity * 0.3 + harassment * 0.5);
    let decision: ModerationDecision = 'allow';
    if (score >= this.block_threshold) decision = 'block';
    else if (score >= this.flag_threshold) decision = 'flag';
    return {
      decision,
      score,
      categories: { profanity: profanity * 0.3, harassment: harassment * 0.5 },
    };
  }
}
