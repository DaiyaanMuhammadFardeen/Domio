/**
 * Notification dispatcher — audit log + GDPR redaction.
 *
 * Every notification attempt (sent / suppressed / failed) writes a
 * row to notification_audit with a `redacted_fields` JSON column
 * listing which PII fields were stripped before the payload was
 * delivered.
 *
 * Redaction policy (v1):
 *   - email       → replaced with `***@<domain>` (preserve domain)
 *   - phone       → replaced with `***`
 *   - first_name  → replaced with `***`
 *   - last_name   → replaced with `***`
 *   - company     → preserved (sales needs it)
 *   - everything else → preserved
 *
 * The full unredacted payload is never persisted in notification_audit;
 * the audit row only carries the SHA-256 hash of the payload so a
 * duplicate send for the same payload is detectable without exposing
 * PII to the audit log reader.
 */

import { createHash } from 'node:crypto';
import type { AuditEntry, Notification, NotificationPayload } from '../types.js';

const REDACTABLE_FIELDS = ['email', 'phone', 'first_name', 'last_name'] as const;
type RedactableField = (typeof REDACTABLE_FIELDS)[number];

const REDACTED_TOKEN = '***';

export interface RedactionResult {
  payload: NotificationPayload;
  redactedFields: RedactableField[];
}

/**
 * redactFields strips PII from a Notification's payload fields map.
 * Returns the redacted payload and the list of fields that were
 * redacted.
 *
 * The redaction is intentionally conservative — fields with
 * redactable names are always redacted even if their value is
 * empty, so the audit row records the operator's intent.
 */
export function redactFields(payload: NotificationPayload): RedactionResult {
  const fields = payload.fields ?? {};
  const redacted: RedactableField[] = [];
  const next: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (isRedactable(k)) {
      next[k] = redactValue(k, v);
      redacted.push(k);
    } else {
      next[k] = v;
    }
  }
  return {
    payload: { ...payload, fields: next },
    redactedFields: redacted,
  };
}

function isRedactable(name: string): name is RedactableField {
  return (REDACTABLE_FIELDS as readonly string[]).includes(name);
}

function redactValue(name: RedactableField, raw: string): string {
  if (!raw) return REDACTED_TOKEN;
  switch (name) {
    case 'email': {
      const at = raw.indexOf('@');
      if (at < 0) return REDACTED_TOKEN;
      return `${REDACTED_TOKEN}@${raw.slice(at + 1)}`;
    }
    case 'phone':
      return REDACTED_TOKEN;
    case 'first_name':
    case 'last_name':
      return REDACTED_TOKEN;
  }
}

/**
 * payloadHash is a stable SHA-256 of the unredacted payload body
 * + recipient. Two notifications with identical (body, recipient)
 * produce the same hash, so duplicate sends are detectable from
 * the audit log without exposing PII.
 */
export function payloadHash(n: Notification): string {
  const h = createHash('sha256');
  h.update(n.recipient);
  h.update('\0');
  h.update(n.payload.title);
  h.update('\0');
  h.update(n.payload.body);
  if (n.payload.link) h.update('\0').update(n.payload.link);
  if (n.payload.fields) {
    for (const k of Object.keys(n.payload.fields).sort()) {
      h.update('\0')
        .update(k)
        .update('=')
        .update(n.payload.fields[k] ?? '');
    }
  }
  return h.digest('hex');
}

/**
 * buildAuditEntry assembles the audit row for a notification
 * attempt. The `redacted_fields` column carries the list of fields
 * that were stripped before sending.
 */
export function buildAuditEntry(
  n: Notification,
  state: AuditEntry['state'],
  errorMessage?: string,
): AuditEntry {
  const redacted = redactFields(n.payload);
  return {
    workspace_id: n.workspace_id,
    rule_id: n.rule_id,
    viewer_id_key: n.viewer_id_key,
    channel: n.channel,
    recipient: n.recipient,
    payload_hash: payloadHash(n),
    state,
    ...(errorMessage ? { error_message: errorMessage } : {}),
    // The redacted_fields list is encoded into the row via a parallel
    // channel (caller passes it to the writer). Exposed here for
    // tests.
    ...({ redacted_fields: redacted.redactedFields } as Record<string, unknown>),
  };
}

/** WithRedacted is the AuditEntry + the redaction list. */
export interface AuditEntryWithRedaction extends AuditEntry {
  redacted_fields: RedactableField[];
}

/**
 * buildAuditEntryWithRedaction is the form the dispatcher actually
 * uses — it includes the redacted_fields list as a structured
 * column so the dashboard can show "X notifications redacted
 * fields before delivery".
 */
export function buildAuditEntryWithRedaction(
  n: Notification,
  state: AuditEntry['state'],
  errorMessage?: string,
): AuditEntryWithRedaction {
  const base = buildAuditEntry(n, state, errorMessage);
  const redacted = redactFields(n.payload).redactedFields;
  return { ...base, redacted_fields: redacted };
}

/**
 * AuditWriter is the contract the dispatcher uses to persist rows.
 * Production wires Postgres; tests use the in-memory writer.
 */
export interface AuditWriter {
  write(entry: AuditEntryWithRedaction): Promise<void>;
}

/** MemoryAuditWriter captures entries for inspection in tests. */
export class MemoryAuditWriter implements AuditWriter {
  readonly entries: AuditEntryWithRedaction[] = [];
  async write(entry: AuditEntryWithRedaction): Promise<void> {
    this.entries.push(entry);
  }
}

/** NoopAuditWriter discards entries (debug builds). */
export class NoopAuditWriter implements AuditWriter {
  async write(_entry: AuditEntryWithRedaction): Promise<void> {
    /* discard */
  }
}
