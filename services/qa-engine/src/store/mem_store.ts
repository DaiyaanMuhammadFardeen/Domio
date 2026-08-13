/**
 * @domio/qa-engine — in-memory store.
 */

import type { QaThread, QaSubmit, QaUpvote } from '../types.js';
import {
  type QaStore,
  type CreateThreadRow,
  type UpdateThreadRow,
  type SubmitRow,
  type UpvoteRow,
  conflictError,
  notFoundError,
  alreadyUpvotedError,
} from '../store.js';

export class InMemoryQaStore implements QaStore {
  private readonly threads = new Map<string, QaThread>();
  private readonly submits = new Map<string, QaSubmit>();
  private readonly upvotes = new Map<string, QaUpvote>(); // submit_id::participant_id -> upvote

  private upvoteKey(submit_id: string, participant_id: string): string {
    return `${submit_id}::${participant_id}`;
  }

  async createThread(row: CreateThreadRow): Promise<QaThread> {
    if (this.threads.has(row.thread.id)) throw conflictError(row.thread.id, -1);
    this.threads.set(row.thread.id, row.thread);
    return row.thread;
  }

  async getThread(id: string): Promise<QaThread | null> {
    return this.threads.get(id) ?? null;
  }

  async updateThread(row: UpdateThreadRow): Promise<QaThread> {
    const existing = this.threads.get(row.thread_id);
    if (!existing) throw notFoundError(row.thread_id);
    if (existing.version !== row.expected_version) {
      throw conflictError(row.thread_id, existing.version);
    }
    this.threads.set(row.thread_id, row.next);
    return row.next;
  }

  async submit(row: SubmitRow): Promise<QaSubmit> {
    if (row.submit.thread_id) {
      const t = this.threads.get(row.submit.thread_id);
      if (!t) throw notFoundError(row.submit.thread_id);
    }
    this.submits.set(row.submit.id, row.submit);
    return row.submit;
  }

  async getSubmit(id: string): Promise<QaSubmit | null> {
    return this.submits.get(id) ?? null;
  }

  async upvote(row: UpvoteRow): Promise<{ upvote: QaUpvote; submit: QaSubmit }> {
    const submit = this.submits.get(row.upvote.submit_id);
    if (!submit) throw notFoundError(row.upvote.submit_id);
    const k = this.upvoteKey(submit.id, row.upvote.participant_id);
    if (this.upvotes.has(k)) throw alreadyUpvotedError(row.upvote.participant_id);
    this.upvotes.set(k, row.upvote);
    const next: QaSubmit = { ...submit, upvotes: submit.upvotes + 1 };
    this.submits.set(submit.id, next);
    return { upvote: row.upvote, submit: next };
  }

  async listBySession(input: {
    workspace_id: string;
    session_id: string;
  }): Promise<ReadonlyArray<QaSubmit>> {
    const out: QaSubmit[] = [];
    for (const s of this.submits.values()) {
      if (s.workspace_id === input.workspace_id && s.session_id === input.session_id) out.push(s);
    }
    return out;
  }
}
