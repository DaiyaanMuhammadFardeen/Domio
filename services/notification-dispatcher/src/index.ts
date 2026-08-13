/**
 * Notification dispatcher — barrel exports (Phase 17 W8 + Phase 18 collab + webhooks).
 */

export {
  evaluateRule,
  evaluateAll,
  matches,
  renderPayload,
  resolveRecipient,
} from './rules/evaluate.js';

export {
  Router,
  SlackSender,
  TeamsSender,
  EmailSender,
  InAppSender,
  WebhookSender,
} from './channels/router.js';
export type {
  ChannelSender,
  EmailTransport,
  NatsPublisher,
  OutboundSigner,
  SendResult,
} from './channels/router.js';

export type {
  AuditEntry,
  ChannelKind,
  CRMSyncEvent,
  Notification,
  NotificationPayload,
  NotificationRule,
  RuleCondition,
} from './types.js';

// ── Collaboration event types ──────────────────────────────────
export { parseCollabEvent } from './collab/parse.js';
export { mapCollabEvent } from './collab/mapper.js';
export { MentionDedup } from './collab/dedup.js';
export type {
  CollabEventEnvelope,
  CommentMentionedPayload,
  ApprovalRequestedPayload,
  AssignmentCreatedPayload,
} from './collab/types.js';

// ── NATS subscription manager ──────────────────────────────────
export { NatsSubscriptionManager, connectWithRetry } from './nats_manager.js';
export type { NatsManagerDeps, NatsManagerHandlers } from './nats_manager.js';

// ── HMAC signing + verification ────────────────────────────────
export { signPayload, verifySignature } from './webhooks/hmac.js';

// ── Action buttons (idempotent) ────────────────────────────────
export {
  buildActionButtons,
  buildActionBlocks,
  handleAction,
  parseCallbackPayload,
  InMemoryIdempotencyStore,
  NoopActionHandler,
} from './webhooks/actions.js';
export type {
  ActionButton,
  ActionContext,
  ActionHandler,
  ActionKind,
  ActionResult,
  CallbackPayload,
  IdempotencyStore,
} from './webhooks/actions.js';

// ── Slash commands ─────────────────────────────────────────────
export {
  parseSlashCommand,
  dispatchCommand,
  registerCommand,
  getCommand,
  NoopCommandRunner,
} from './webhooks/commands.js';
export type {
  SlashCommand,
  CommandHandler,
  CommandResponse,
  CommandResult,
  CommandRunner,
  ProblemDetail,
} from './webhooks/commands.js';

// ── Webhook handlers ───────────────────────────────────────────
export {
  receiveSlackEvent,
  receiveSlackInteraction,
  receiveSlackCommand,
  receiveTeamsAction,
  receiveTeamsCommand,
} from './webhooks/handlers.js';
export type { WebhookDeps, WebhookResponse } from './webhooks/handlers.js';

// ── Quiet hours / DND digests ──────────────────────────────────
export { isQuietHour, buildDigest, defaultOffsetMinutes } from './quiet_hours.js';
export type { QuietHours, DigestItem, DigestPayload } from './quiet_hours.js';

// ── Subscription-based routing ─────────────────────────────────
export { routeBySubscription, InMemorySubscriptionProvider } from './routing.js';
export type {
  NotificationSubscription,
  ResolvedDelivery,
  SubscriptionProvider,
} from './routing.js';
