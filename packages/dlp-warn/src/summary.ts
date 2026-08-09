/**
 * @domio/dlp-warn — admin summary aggregate.
 *
 * P20.5 B3 §4.3.6: `/admin/dlp` shows aggregate counts from the audit log:
 *   "47 shares warned in the last 7 days, 12 bypassed."
 *
 * This module is a pure aggregator — it doesn't read the audit log itself;
 * the caller passes in pre-queried events. Keeps the dlp-warn package free
 * of database dependencies.
 */

import type { DlpRuleId } from './types.js';
import { DLP_RULE_IDS, DLP_SNIPPET_REDACTED } from './types.js';

export interface DlpAuditEvent {
  readonly action: string;
  readonly createdAt: Date;
  readonly metadata: Record<string, unknown>;
}

export interface DlpSummary {
  readonly windowDays: number;
  readonly warnedCount: number;
  readonly bypassedCount: number;
  readonly bypassRate: number; // 0..1
  readonly byRule: Readonly<Record<DlpRuleId, number>>;
}

export function summarizeDlpEvents(
  events: readonly DlpAuditEvent[],
  windowDays: number = 7,
  now: Date = new Date(),
): DlpSummary {
  const cutoff = now.getTime() - windowDays * 86_400_000;
  const byRule: Record<DlpRuleId, number> = {
    credit_card: 0,
    email: 0,
    us_ssn: 0,
  };
  let warned = 0;
  let bypassed = 0;

  for (const e of events) {
    if (e.createdAt.getTime() < cutoff) continue;
    if (e.action === 'dlp.warning_shown') {
      warned++;
      const ruleIds = (e.metadata.matchedRuleIds as string[] | undefined) ?? [];
      for (const r of ruleIds) {
        if (DLP_RULE_IDS.includes(r as DlpRuleId)) {
          byRule[r as DlpRuleId]++;
        }
      }
    } else if (e.action === 'dlp.bypass_acknowledged') {
      bypassed++;
    }
  }

  const bypassRate = warned === 0 ? 0 : bypassed / warned;
  return {
    windowDays,
    warnedCount: warned,
    bypassedCount: bypassed,
    bypassRate,
    byRule,
  };
}

/** Redact a snippet string for admin summary display. */
export function redactSnippet(snippet: string): string {
  if (snippet.length <= 0) return DLP_SNIPPET_REDACTED;
  return DLP_SNIPPET_REDACTED;
}