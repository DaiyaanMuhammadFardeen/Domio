/**
 * @domio/sentiment-collector — per-slide tally.
 */

import type { SentimentScore, SentimentSummary } from './types.js';

export class SentimentTally {
  private readonly entries = new Map<string, Map<string, SentimentScore>>(); // slide_id -> participant_id -> score

  add(slide_id: string, participant_id: string, score: SentimentScore): void {
    let slide = this.entries.get(slide_id);
    if (!slide) {
      slide = new Map();
      this.entries.set(slide_id, slide);
    }
    slide.set(participant_id, score);
  }

  summary(slide_id: string): SentimentSummary {
    const slide = this.entries.get(slide_id);
    const by_score: Record<SentimentScore, number> = { [-2]: 0, [-1]: 0, [0]: 0, [1]: 0, [2]: 0 };
    let total = 0;
    let count = 0;
    if (slide) {
      for (const s of slide.values()) {
        by_score[s] += 1;
        total += s;
        count += 1;
      }
    }
    const average = count === 0 ? 0 : total / count;
    return { slide_id, count, average, by_score };
  }

  clear(): void {
    this.entries.clear();
  }
}
