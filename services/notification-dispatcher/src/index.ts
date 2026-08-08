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

export type {
  AuditEntry,
  ChannelKind,
  CRMSyncEvent,
  Notification,
  NotificationPayload,
  NotificationRule,
  RuleCondition,
} from './types.js';
