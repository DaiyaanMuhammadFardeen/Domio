/**
 * Notification dispatcher — barrel exports (Phase 17 W8).
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
