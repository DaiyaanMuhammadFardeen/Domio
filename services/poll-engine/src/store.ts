/**
 * @domio/poll-engine — store interface.
 */

import type { Poll, PollVote, PollAggregate } from './types.js';

export interface CreatePollRow {
  poll: Poll;
}

export interface UpdatePollRow {
  poll_id: string;
  expected_version: number;
  next: Poll;
}

export interface CastVoteRow {
  vote: PollVote;
  expected_existing_vote: PollVote | null;
}

export interface PollStoreError extends Error {
  readonly code: 'NOT_FOUND' | 'CONFLICT' | 'CLOSED' | 'DUPLICATE';
}

function makeStoreError(code: PollStoreError['code'], message: string): PollStoreError {
  const e = new Error(message) as PollStoreError & { code: PollStoreError['code'] };
  Object.defineProperty(e, 'code', { value: code, writable: false, enumerable: true });
  return e;
}

export function notFoundError(id: string): PollStoreError {
  return makeStoreError('NOT_FOUND', `poll not found: ${id}`);
}

export function conflictError(id: string, currentVersion: number): PollStoreError {
  return makeStoreError(
    'CONFLICT',
    `poll ${id} optimistic concurrency conflict (current ${currentVersion})`,
  );
}

export function closedError(id: string): PollStoreError {
  return makeStoreError('CLOSED', `poll ${id} is not open`);
}

export function duplicateVoteError(participant_id: string): PollStoreError {
  return makeStoreError('DUPLICATE', `participant ${participant_id} already voted`);
}

export interface PollStore {
  create(row: CreatePollRow): Promise<Poll>;
  getById(id: string): Promise<Poll | null>;
  update(row: UpdatePollRow): Promise<Poll>;
  castVote(row: CastVoteRow): Promise<PollVote>;
  aggregate(poll_id: string): Promise<PollAggregate>;
  listBySession(input: { workspace_id: string; session_id: string }): Promise<ReadonlyArray<Poll>>;
}

export function isPollStore(v: unknown): v is PollStore {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as { create?: unknown }).create === 'function' &&
    typeof (v as { getById?: unknown }).getById === 'function' &&
    typeof (v as { update?: unknown }).update === 'function' &&
    typeof (v as { castVote?: unknown }).castVote === 'function'
  );
}
