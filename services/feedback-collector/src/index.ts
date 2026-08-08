/**
 * @domio/feedback-collector — NPS + per-slide stars + free-text.
 *
 * Phase 16 W9. Each participant submits one feedback response per
 * session. The aggregation rolls into `recap_feedback_aggregation`
 * for the presenter's recap.
 */

export interface FeedbackResponse {
  readonly id: string;
  readonly workspace_id: string;
  readonly session_id: string;
  readonly participant_id: string;
  readonly nps_score: number | null;
  readonly stars: ReadonlyArray<{ slide_id: string; score: number }>;
  readonly free_text: string | null;
  readonly submitted_at_ms: number;
}

export interface RecapAggregation {
  readonly workspace_id: string;
  readonly session_id: string;
  readonly nps_promoters: number;
  readonly nps_passives: number;
  readonly nps_detractors: number;
  readonly star_average: number | null;
  readonly free_text_count: number;
}

export class FeedbackError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'FeedbackError';
  }
}

export class InMemoryFeedbackStore {
  private readonly rows = new Map<string, FeedbackResponse>();
  private readonly participantIndex = new Map<string, string>(); // w::s::p -> id

  private key(w: string, s: string, p: string): string { return `${w}::${s}::${p}`; }

  async submit(input: Omit<FeedbackResponse, 'id' | 'submitted_at_ms'> & { id?: string; submitted_at_ms?: number }): Promise<FeedbackResponse> {
    const k = this.key(input.workspace_id, input.session_id, input.participant_id);
    if (this.participantIndex.has(k)) {
      throw new FeedbackError('DUPLICATE', `participant ${input.participant_id} already submitted feedback`);
    }
    const id = input.id ?? cryptoRandomId();
    const response: FeedbackResponse = {
      id,
      workspace_id: input.workspace_id,
      session_id: input.session_id,
      participant_id: input.participant_id,
      nps_score: input.nps_score,
      stars: input.stars,
      free_text: input.free_text,
      submitted_at_ms: input.submitted_at_ms ?? Date.now(),
    };
    this.rows.set(id, response);
    this.participantIndex.set(k, id);
    return response;
  }

  async list(input: { workspace_id: string; session_id: string }): Promise<ReadonlyArray<FeedbackResponse>> {
    const out: FeedbackResponse[] = [];
    for (const r of this.rows.values()) {
      if (r.workspace_id === input.workspace_id && r.session_id === input.session_id) out.push(r);
    }
    return out;
  }

  async aggregate(input: { workspace_id: string; session_id: string }): Promise<RecapAggregation> {
    const list = await this.list(input);
    let promoters = 0, passives = 0, detractors = 0;
    let starSum = 0;
    let starCount = 0;
    let free_text_count = 0;
    for (const r of list) {
      if (r.nps_score !== null) {
        if (r.nps_score >= 9) promoters += 1;
        else if (r.nps_score >= 7) passives += 1;
        else detractors += 1;
      }
      for (const s of r.stars) {
        starSum += s.score;
        starCount += 1;
      }
      if (r.free_text && r.free_text.length > 0) free_text_count += 1;
    }
    return {
      workspace_id: input.workspace_id,
      session_id: input.session_id,
      nps_promoters: promoters,
      nps_passives: passives,
      nps_detractors: detractors,
      star_average: starCount === 0 ? null : starSum / starCount,
      free_text_count,
    };
  }
}

function cryptoRandomId(): string {
  const g: typeof globalThis & { crypto?: { randomUUID?: () => string } } = globalThis;
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  let s = '';
  for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}
