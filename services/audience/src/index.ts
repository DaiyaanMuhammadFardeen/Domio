/**
 * @domio/audience-service — barrel.
 *
 * Phase 16 W1. The audience-service is the cross-shard coordinator for
 * the audience participation feature. The first concrete capabilities
 * land in W1 (session join) and W4-W8 (poll, word-cloud, qa, quiz,
 * reactions/nav/sentiment/hand). All capabilities share:
 *
 *   - a {@link ParticipantSessionStore} (Postgres in production)
 *   - an {@link AudienceAuditEmitter} (hash-chained via @domio/audit-ts)
 *   - a {@link ParticipantIdempotencyStore}
 *
 * Engines (poll, word-cloud, qa, quiz) live in their own services
 * under `services/<engine>/`. The audience-service exports the shared
 * types so the engines can compose against the same coordinate system.
 */

export * from './types.js';
export * from './errors.js';
