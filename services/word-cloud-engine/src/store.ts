/**
 * @domio/word-cloud-engine — store interface.
 */

import type { WordCloud, WordCloudSubmit, WordCloudAggregate } from './types.js';

export interface CreateWordCloudRow {
  cloud: WordCloud;
}

export interface UpdateWordCloudRow {
  cloud_id: string;
  expected_version: number;
  next: WordCloud;
}

export interface SubmitRow {
  submit: WordCloudSubmit;
  expected_existing: WordCloudSubmit | null;
}

export interface WordCloudStoreError extends Error {
  readonly code: 'NOT_FOUND' | 'CONFLICT' | 'CLOSED' | 'REPEAT_FORBIDDEN' | 'TOO_LONG';
}

function makeStoreError(code: WordCloudStoreError['code'], message: string): WordCloudStoreError {
  const e = new Error(message) as WordCloudStoreError & { code: WordCloudStoreError['code'] };
  Object.defineProperty(e, 'code', { value: code, writable: false, enumerable: true });
  return e;
}

export function notFoundError(id: string): WordCloudStoreError {
  return makeStoreError('NOT_FOUND', `word_cloud not found: ${id}`);
}
export function conflictError(id: string, currentVersion: number): WordCloudStoreError {
  return makeStoreError(
    'CONFLICT',
    `word_cloud ${id} optimistic concurrency conflict (current ${currentVersion})`,
  );
}
export function closedError(id: string): WordCloudStoreError {
  return makeStoreError('CLOSED', `word_cloud ${id} is not open`);
}
export function repeatError(participant_id: string): WordCloudStoreError {
  return makeStoreError(
    'REPEAT_FORBIDDEN',
    `word_cloud repeats forbidden for participant ${participant_id}`,
  );
}
export function tooLongError(len: number, max: number): WordCloudStoreError {
  return makeStoreError('TOO_LONG', `word_cloud submit too long: ${len} > ${max}`);
}

export interface WordCloudStore {
  create(row: CreateWordCloudRow): Promise<WordCloud>;
  getById(id: string): Promise<WordCloud | null>;
  update(row: UpdateWordCloudRow): Promise<WordCloud>;
  submit(row: SubmitRow): Promise<WordCloudSubmit>;
  aggregate(cloud_id: string): Promise<WordCloudAggregate>;
  listBySession(input: {
    workspace_id: string;
    session_id: string;
  }): Promise<ReadonlyArray<WordCloud>>;
}

export function isWordCloudStore(v: unknown): v is WordCloudStore {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as { create?: unknown }).create === 'function' &&
    typeof (v as { getById?: unknown }).getById === 'function' &&
    typeof (v as { update?: unknown }).update === 'function' &&
    typeof (v as { submit?: unknown }).submit === 'function'
  );
}
