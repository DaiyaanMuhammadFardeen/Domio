/**
 * @domio/sdk — public Domio SDK entrypoint.
 *
 * Editor, viewer, MCP gateway, and CLI should depend on this package only.
 * The package re-exports everything from `@domio/schema` and ships the
 * `ClientDocumentLoader` + `AutosaveQueue` plumbing introduced in Phase 02.
 */

export * from '@domio/schema';

export {
  HttpClientDocumentLoader,
  GeneratedIdempotencyKey,
  type ClientDocumentLoader,
  type SaveResult,
  type SaveError,
  type IdempotencyKeyProvider,
  type HttpLikeTransport,
} from './loader.js';

export {
  AutosaveQueue,
  InMemoryPersistentStore,
  type AutosaveQueueOptions,
  type AutosavePayload,
  type PersistentStore,
} from './autosave-queue.js';

import { newToken } from '@domio/common';

/** Convenience helper for callers that need an idempotency key. */
export function newIdempotencyKey(): string {
  return newToken(16);
}
