/**
 * Tests for the PII stripper (Phase 17 W1).
 */
import { describe, expect, it } from 'vitest';
import { buildPiiStripper } from './pii.js';

describe('pii stripper', () => {
  const stripper = buildPiiStripper();

  it('redacts email addresses in string fields', () => {
    const out = stripper.strip({
      event_name: 'interaction',
      value_text: 'contact me at alice@example.com',
    });
    expect(out['value_text']).toBe('contact me at [redacted-email]');
  });

  it('truncates IPv4 addresses to /24', () => {
    const out = stripper.strip({
      event_name: 'view',
      ua_family: '203.0.113.42 browser',
    });
    expect(out['ua_family']).toBe('203.0.113.0 browser');
  });

  it('redacts credit card numbers in interaction data', () => {
    const out = stripper.strip({
      interaction_data: 'paid with 4111 1111 1111 1111 today',
    });
    expect(out['interaction_data']).toContain('[redacted-card]');
    expect(out['interaction_data']).not.toContain('4111');
  });

  it('redacts phone numbers', () => {
    const out = stripper.strip({ value_text: 'call +1 555 123 4567' });
    expect(out['value_text']).toBe('call [redacted-phone]');
  });

  it('redacts SSNs', () => {
    const out = stripper.strip({ value_text: 'SSN 123-45-6789' });
    expect(out['value_text']).toBe('SSN [redacted-ssn]');
  });

  it('enforces K-anonymity floor on value_text', () => {
    const long = 'a'.repeat(8000);
    const out = stripper.strip({ value_text: long });
    expect((out['value_text'] as string).length).toBe(4000);
  });

  it('walks nested objects and arrays', () => {
    const out = stripper.strip({
      payload: { inner: { deep: 'email me at bob@example.com' }, list: ['a@b.com', 'plain'] },
    });
    const payload = out['payload'] as { inner: { deep: string }; list: string[] };
    expect(payload.inner.deep).toBe('email me at [redacted-email]');
    expect(payload.list[0]).toBe('[redacted-email]');
    expect(payload.list[1]).toBe('plain');
  });

  it('is idempotent', () => {
    const out1 = stripper.strip({ value_text: 'alice@example.com' });
    const out2 = stripper.strip(out1);
    expect(out2['value_text']).toBe(out1['value_text']);
  });

  it('reports whether stripping changed anything', () => {
    const r = stripper.stripWithReport({ value_text: 'plain text' });
    expect(r.stripped).toBe(false);
    const r2 = stripper.stripWithReport({ value_text: 'a@b.com' });
    expect(r2.stripped).toBe(true);
  });
});
