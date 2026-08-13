/**
 * @domio/word-cloud-engine — in-memory store.
 */

import type { WordCloud, WordCloudSubmit, WordCloudAggregate } from '../types.js';
import {
  type WordCloudStore,
  type CreateWordCloudRow,
  type UpdateWordCloudRow,
  type SubmitRow,
  notFoundError,
  conflictError,
  closedError,
  repeatError,
} from '../store.js';

export class InMemoryWordCloudStore implements WordCloudStore {
  private readonly clouds = new Map<string, WordCloud>();
  private readonly submits = new Map<string, WordCloudSubmit>();
  private readonly repeatIndex = new Map<string, string>(); // cloud_id::participant_id -> submit_id

  private repeatKey(cloud_id: string, participant_id: string): string {
    return `${cloud_id}::${participant_id}`;
  }

  async create(row: CreateWordCloudRow): Promise<WordCloud> {
    if (this.clouds.has(row.cloud.id)) throw conflictError(row.cloud.id, -1);
    this.clouds.set(row.cloud.id, row.cloud);
    return row.cloud;
  }

  async getById(id: string): Promise<WordCloud | null> {
    return this.clouds.get(id) ?? null;
  }

  async update(row: UpdateWordCloudRow): Promise<WordCloud> {
    const existing = this.clouds.get(row.cloud_id);
    if (!existing) throw notFoundError(row.cloud_id);
    if (existing.version !== row.expected_version) {
      throw conflictError(row.cloud_id, existing.version);
    }
    this.clouds.set(row.cloud_id, row.next);
    return row.next;
  }

  async submit(row: SubmitRow): Promise<WordCloudSubmit> {
    const cloud = this.clouds.get(row.submit.cloud_id);
    if (!cloud) throw notFoundError(row.submit.cloud_id);
    if (cloud.status !== 'open') throw closedError(cloud.id);
    if (!cloud.allow_repeat) {
      const k = this.repeatKey(cloud.id, row.submit.participant_id);
      if (this.repeatIndex.has(k)) throw repeatError(row.submit.participant_id);
      this.repeatIndex.set(k, row.submit.id);
    }
    this.submits.set(row.submit.id, row.submit);
    return row.submit;
  }

  async aggregate(cloud_id: string): Promise<WordCloudAggregate> {
    const cloud = this.clouds.get(cloud_id);
    if (!cloud) throw notFoundError(cloud_id);
    const counts: Record<string, number> = {};
    let total = 0;
    for (const s of this.submits.values()) {
      if (s.cloud_id !== cloud_id) continue;
      if (s.moderation === 'block') continue;
      for (const tok of s.tokens) {
        counts[tok] = (counts[tok] ?? 0) + 1;
        total += 1;
      }
    }
    return { cloud_id, counts, total, computed_at_ms: Date.now() };
  }

  async listBySession(input: {
    workspace_id: string;
    session_id: string;
  }): Promise<ReadonlyArray<WordCloud>> {
    const out: WordCloud[] = [];
    for (const c of this.clouds.values()) {
      if (c.workspace_id === input.workspace_id && c.session_id === input.session_id) out.push(c);
    }
    return out;
  }
}
