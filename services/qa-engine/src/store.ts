/**
 * @domio/qa-engine — store interface.
 */

import type { QaThread, QaSubmit, QaUpvote } from './types.js';

export interface CreateThreadRow {
  thread: QaThread;
}
export interface UpdateThreadRow {
  thread_id: string;
  expected_version: number;
  next: QaThread;
}
export interface SubmitRow {
  submit: QaSubmit;
  expected_existing: QaSubmit | null;
}
export interface UpvoteRow {
  upvote: QaUpvote;
  expected_existing: QaUpvote | null;
}

export interface QaStoreError extends Error {
  readonly code: 'NOT_FOUND' | 'CONFLICT' | 'TOO_LONG' | 'ALREADY_UPVOTED';
}
function makeStoreError(code: QaStoreError['code'], message: string): QaStoreError {
  const e = new Error(message) as QaStoreError & { code: QaStoreError['code'] };
  Object.defineProperty(e, 'code', { value: code, writable: false, enumerable: true });
  return e;
}
export const notFoundError = (id: string): QaStoreError =>
  makeStoreError('NOT_FOUND', `qa ${id} not found`);
export const conflictError = (id: string, v: number): QaStoreError =>
  makeStoreError('CONFLICT', `qa ${id} concurrency (current ${v})`);
export const tooLongError = (len: number, max: number): QaStoreError =>
  makeStoreError('TOO_LONG', `qa body too long: ${len} > ${max}`);
export const alreadyUpvotedError = (participant_id: string): QaStoreError =>
  makeStoreError('ALREADY_UPVOTED', `participant ${participant_id} already upvoted`);

export interface QaStore {
  createThread(row: CreateThreadRow): Promise<QaThread>;
  getThread(id: string): Promise<QaThread | null>;
  updateThread(row: UpdateThreadRow): Promise<QaThread>;
  submit(row: SubmitRow): Promise<QaSubmit>;
  getSubmit(id: string): Promise<QaSubmit | null>;
  upvote(row: UpvoteRow): Promise<{ upvote: QaUpvote; submit: QaSubmit }>;
  listBySession(input: {
    workspace_id: string;
    session_id: string;
    status?: QaThread['status'];
  }): Promise<ReadonlyArray<QaSubmit>>;
}

export function isQaStore(v: unknown): v is QaStore {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as { createThread?: unknown }).createThread === 'function' &&
    typeof (v as { submit?: unknown }).submit === 'function'
  );
}
