/**
 * Notification dispatcher — orchestration.
 *
 * Wires the rules engine, the channel router, the daily-cap
 * store, and the audit logger together. The dispatcher is
 * consumed by main.ts; everything in this file is exported
 * so tests can drive it directly without going through the
 * process entrypoint.
 *
 * Flow per CRM sync event:
 *   1. Evaluate rules → 0..N notifications.
 *   2. For each notification:
 *      a. Look up the rule's daily_cap and check it via the cap
 *         store. Over the cap → audit 'suppressed' + skip.
 *      b. Redact PII from payload fields → produce audit row.
 *      c. Send via channel router → capture SendResult.
 *      d. Audit 'sent' or 'failed' depending on result.
 */

import { evaluateAll } from './rules/evaluate.js';
import type { Router, SendResult } from './channels/router.js';
import type { DailyCapStore } from './caps/daily.js';
import {
  buildAuditEntryWithRedaction,
  type AuditWriter,
  type AuditEntryWithRedaction,
} from './audit/redact.js';
import type { CRMSyncEvent, Notification, NotificationRule } from './types.js';

export interface DispatcherDeps {
  router: Router;
  caps: DailyCapStore;
  audit: AuditWriter;
}

export class Dispatcher {
  constructor(private readonly deps: DispatcherDeps) {}

  /**
   * Dispatch evaluates rules for one event and processes the
   * resulting notifications. Returns the list of audit rows
   * written so the caller can log them.
   */
  async dispatch(rules: NotificationRule[], event: CRMSyncEvent): Promise<AuditEntryWithRedaction[]> {
    const notifs = evaluateAll(rules, event);
    const rows: AuditEntryWithRedaction[] = [];
    for (const n of notifs) {
      const row = await this.process(n, rules);
      rows.push(row);
    }
    return rows;
  }

  /**
   * dispatchNotifications processes pre-built Notification objects
   * directly (bypassing rules evaluation). Used by the collaboration
   * event path where notifications are constructed by the collab
   * mapper, not the rules engine.
   *
   * @param notifications  Pre-built notifications to dispatch.
   * @param dailyCap       Optional per-recipient daily cap. Falls back
   *                       to a very high default when omitted.
   */
  async dispatchNotifications(
    notifications: Notification[],
    dailyCap = 1_000_000,
  ): Promise<AuditEntryWithRedaction[]> {
    const rows: AuditEntryWithRedaction[] = [];
    for (const n of notifications) {
      const row = await this.processWithCap(n, dailyCap);
      rows.push(row);
    }
    return rows;
  }

  private async process(n: Notification, rules: NotificationRule[]): Promise<AuditEntryWithRedaction> {
    const cap = this.capFor(n.rule_id, rules);
    const allowed = await this.deps.caps.allowAndIncr(n.recipient, cap);
    if (!allowed) {
      const entry = buildAuditEntryWithRedaction(n, 'suppressed', 'daily_cap_exceeded');
      await this.deps.audit.write(entry);
      return entry;
    }

    let result: SendResult;
    try {
      result = await this.deps.router.send(n);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const entry = buildAuditEntryWithRedaction(n, 'failed', msg);
      await this.deps.audit.write(entry);
      return entry;
    }

    if (result.ok) {
      const entry = buildAuditEntryWithRedaction(n, 'sent');
      await this.deps.audit.write(entry);
      return entry;
    }
    const entry = buildAuditEntryWithRedaction(n, 'failed', result.error ?? 'unknown');
    await this.deps.audit.write(entry);
    return entry;
  }

  /**
   * capFor returns the rule's daily_cap, defaulting to a very high
   * number if the rule isn't found (e.g. the rule was deleted
   * between evaluation and dispatch).
   */
  private capFor(ruleID: string, rules: NotificationRule[]): number {
    const r = rules.find((x) => x.rule_id === ruleID);
    return r?.daily_cap ?? 1_000_000;
  }

  /**
   * processWithCap is like `process` but takes a fixed daily cap
   * instead of looking it up from the rules list. Used by the
   * collaboration event path.
   */
  private async processWithCap(n: Notification, dailyCap: number): Promise<AuditEntryWithRedaction> {
    const allowed = await this.deps.caps.allowAndIncr(n.recipient, dailyCap);
    if (!allowed) {
      const entry = buildAuditEntryWithRedaction(n, 'suppressed', 'daily_cap_exceeded');
      await this.deps.audit.write(entry);
      return entry;
    }

    let result: SendResult;
    try {
      result = await this.deps.router.send(n);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const entry = buildAuditEntryWithRedaction(n, 'failed', msg);
      await this.deps.audit.write(entry);
      return entry;
    }

    if (result.ok) {
      const entry = buildAuditEntryWithRedaction(n, 'sent');
      await this.deps.audit.write(entry);
      return entry;
    }
    const entry = buildAuditEntryWithRedaction(n, 'failed', result.error ?? 'unknown');
    await this.deps.audit.write(entry);
    return entry;
  }
}
