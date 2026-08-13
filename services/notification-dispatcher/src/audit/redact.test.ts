import { describe, it, expect } from 'vitest';
import {
  redactFields,
  payloadHash,
  buildAuditEntry,
  buildAuditEntryWithRedaction,
  MemoryAuditWriter,
} from './redact.js';
import type { Notification } from '../types.js';

function notif(overrides: Partial<Notification> = {}): Notification {
  return {
    rule_id: 'r-1',
    workspace_id: 'w-1',
    viewer_id_key: 'v-1',
    channel: 'email',
    recipient: 'a@b.com',
    payload: {
      title: 'T',
      body: 'B',
      fields: {
        email: 'alice@example.com',
        first_name: 'Alice',
        last_name: 'Smith',
        company: 'Acme',
      },
    },
    ...overrides,
  };
}

describe('audit/redact', () => {
  it('redacts email keeping the domain', () => {
    const { payload, redactedFields } = redactFields(notif().payload);
    expect(payload.fields?.email).toBe('***@example.com');
    expect(redactedFields).toContain('email');
  });

  it('redacts phone', () => {
    const { payload } = redactFields({
      title: 'T',
      body: 'B',
      fields: { phone: '+1-555-0100' },
    });
    expect(payload.fields?.phone).toBe('***');
  });

  it('redacts first_name and last_name', () => {
    const { payload, redactedFields } = redactFields({
      title: 'T',
      body: 'B',
      fields: { first_name: 'Alice', last_name: 'Smith' },
    });
    expect(payload.fields?.first_name).toBe('***');
    expect(payload.fields?.last_name).toBe('***');
    expect(redactedFields).toEqual(expect.arrayContaining(['first_name', 'last_name']));
  });

  it('preserves non-redactable fields', () => {
    const { payload } = redactFields({
      title: 'T',
      body: 'B',
      fields: { company: 'Acme', city: 'NYC' },
    });
    expect(payload.fields?.company).toBe('Acme');
    expect(payload.fields?.city).toBe('NYC');
  });

  it('handles empty values', () => {
    const { payload } = redactFields({
      title: 'T',
      body: 'B',
      fields: { email: '', first_name: '' },
    });
    expect(payload.fields?.email).toBe('***');
    expect(payload.fields?.first_name).toBe('***');
  });

  it('handles email with no @', () => {
    const { payload } = redactFields({
      title: 'T',
      body: 'B',
      fields: { email: 'no-at-sign' },
    });
    expect(payload.fields?.email).toBe('***');
  });

  it('payloadHash is stable', () => {
    const n1 = notif();
    const n2 = notif();
    expect(payloadHash(n1)).toBe(payloadHash(n2));
  });

  it('payloadHash changes when body changes', () => {
    const n1 = notif();
    const n2 = notif({ payload: { ...n1.payload, body: 'different' } });
    expect(payloadHash(n1)).not.toBe(payloadHash(n2));
  });

  it('payloadHash changes when recipient changes', () => {
    const n1 = notif();
    const n2 = notif({ recipient: 'c@d.com' });
    expect(payloadHash(n1)).not.toBe(payloadHash(n2));
  });

  it('buildAuditEntry captures state and payload_hash', () => {
    const entry = buildAuditEntry(notif(), 'sent');
    expect(entry.state).toBe('sent');
    expect(entry.payload_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(entry.channel).toBe('email');
  });

  it('buildAuditEntryWithRedaction includes redacted_fields list', () => {
    const entry = buildAuditEntryWithRedaction(notif(), 'sent');
    expect(entry.redacted_fields).toEqual(
      expect.arrayContaining(['email', 'first_name', 'last_name']),
    );
  });

  it('MemoryAuditWriter records entries', async () => {
    const w = new MemoryAuditWriter();
    await w.write(buildAuditEntryWithRedaction(notif(), 'sent'));
    await w.write(buildAuditEntryWithRedaction(notif(), 'failed', 'boom'));
    expect(w.entries).toHaveLength(2);
    expect(w.entries[0]?.state).toBe('sent');
    expect(w.entries[1]?.error_message).toBe('boom');
  });

  it('error_message is omitted when not provided', () => {
    const entry = buildAuditEntry(notif(), 'sent');
    expect(entry.error_message).toBeUndefined();
  });
});
