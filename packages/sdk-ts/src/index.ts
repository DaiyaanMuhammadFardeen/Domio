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

// Typed service clients — the SDK surface apps consume instead of
// fetching endpoints directly. Per Wave 1 §S1.7.
export {
  type ThemeServiceClient,
  type ThemeRecord,
  type BrandKitRecord,
  type A11yAuditFindingDTO,
  type ThemeServiceError,
} from './services/theme-client.js';
export { HttpThemeServiceClient } from './services/http-theme-client.js';
export {
  type LicenseServiceClient,
  type LicenseGrantDTO,
  type RecordingFinalizeRequest,
  type RecordingFinalizeResult,
  type LicenseServiceError,
} from './services/license-client.js';
export { HttpLicenseServiceClient } from './services/license-client.js';
export {
  type AgentServiceClient,
  type NlToolCallSummary,
  type DeckDiffEntry,
  type DeckDiffResult,
  type AuditEntryDTO,
  type AgentServiceError,
} from './services/agent-client.js';
export { HttpAgentServiceClient } from './services/agent-client.js';

import { newToken } from '@domio/common';

/** Convenience helper for callers that need an idempotency key. */
export function newIdempotencyKey(): string {
  return newToken(16);
}
