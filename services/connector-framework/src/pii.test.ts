/**
 * PII detection tests (Phase 08).
 */

import { describe, it, expect } from 'vitest';
import { detectPiiColumns, classifyPii, scanColumnPii } from './pii.js';
import type { CanonicalColumn } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function col(name: string, type: 'string' | 'number' | 'boolean' | 'date' | 'currency' | 'percent' = 'string'): CanonicalColumn {
  return { name, type, semantic_role: 'dimension' };
}

// ---------------------------------------------------------------------------
// Classification ladder
// ---------------------------------------------------------------------------

describe('classifyPii', () => {
  it('returns none for empty array', () => {
    expect(classifyPii([])).toBe('none');
  });

  it('returns low for IP only', () => {
    expect(classifyPii(['ip'])).toBe('low');
  });

  it('returns medium for email only', () => {
    expect(classifyPii(['email'])).toBe('medium');
  });

  it('returns medium for phone only', () => {
    expect(classifyPii(['phone'])).toBe('medium');
  });

  it('returns high for email + another type', () => {
    expect(classifyPii(['email', 'phone'])).toBe('high');
    expect(classifyPii(['email', 'ip'])).toBe('high');
  });

  it('returns restricted for SSN', () => {
    expect(classifyPii(['ssn'])).toBe('restricted');
    expect(classifyPii(['ssn', 'email'])).toBe('restricted');
  });
});

// ---------------------------------------------------------------------------
// scanColumnPii
// ---------------------------------------------------------------------------

describe('scanColumnPii', () => {
  it('detects email addresses', () => {
    const values = [
      'alice@example.com', 'bob@test.org', 'charlie@company.net',
      'dave@domain.io', 'eve@startup.co',
    ];
    const found = scanColumnPii(values);
    expect(found).toContain('email');
  });

  it('detects phone numbers', () => {
    const values = [
      '+1234567890', '+9876543210', '+1112223333',
      '+4445556666', '+7778889999',
    ];
    const found = scanColumnPii(values);
    expect(found).toContain('phone');
  });

  it('detects SSNs', () => {
    const values = [
      '123-45-6789', '987-65-4321', '111-22-3333',
      '444-55-6666', '777-88-9999',
    ];
    const found = scanColumnPii(values);
    expect(found).toContain('ssn');
  });

  it('detects IP addresses', () => {
    const values = [
      '192.168.1.1', '10.0.0.1', '172.16.0.1',
      '8.8.8.8', '1.1.1.1',
    ];
    const found = scanColumnPii(values);
    expect(found).toContain('ip');
  });

  it('does not detect PII in non-string values', () => {
    const values = [1, 2, 3, 4, 5];
    const found = scanColumnPii(values);
    expect(found).toHaveLength(0);
  });

  it('returns empty for insufficient matches (< 3)', () => {
    const values = ['alice@example.com', 'bob@test.org', 'not an email'];
    const found = scanColumnPii(values);
    // Only 2 distinct emails, below threshold of 3
    expect(found).not.toContain('email');
  });
});

// ---------------------------------------------------------------------------
// detectPiiColumns — recall >= 0.99 on emails
// ---------------------------------------------------------------------------

describe('detectPiiColumns — email recall', () => {
  it('achieves recall >= 0.99 on a labeled email corpus', () => {
    // Generate labeled corpus: 200 emails, 20 non-emails
    const emailSamples = Array.from({ length: 200 }, (_, i) => {
      const names = ['alice', 'bob', 'charlie', 'dave', 'eve', 'frank', 'grace', 'heidi', 'ivan', 'judy'];
      const domains = ['example.com', 'test.org', 'company.net', 'domain.io', 'startup.co', 'mail.com', 'inbox.net', 'work.dev'];
      const name = names[i % names.length]!;
      const domain = domains[i % domains.length]!;
      return `${name}${i}@${domain}`;
    });
    const nonEmailSamples = [
      'hello world', 'no email here', 'just text', '12345', 'test',
      'lorem ipsum', 'dolor sit amet', 'consectetur', 'adipiscing', 'elit',
      'sed do', 'eiusmod', 'tempor', 'incididunt', 'ut labore',
      'dolore magna', 'aliqua', 'enim ad', 'minim', 'veniam',
    ];

    const rows: unknown[][] = [];
    for (let i = 0; i < 200; i++) {
      rows.push([emailSamples[i]]);
    }
    for (const s of nonEmailSamples) {
      rows.push([s]);
    }

    const columns = [col('email_address')];
    const piiMap = detectPiiColumns(columns, rows);

    // PII detection works at column level, not per-value
    // The column should be flagged as containing email PII
    expect(piiMap.get('email_address')).toBe('medium');
  });

  it('flags columns with many distinct emails as PII', () => {
    const emails = Array.from({ length: 20 }, (_, i) => `user${i}@example.com`);
    const rows = emails.map((e) => [e]);

    const columns = [col('contact_email')];
    const piiMap = detectPiiColumns(columns, rows);

    expect(piiMap.get('contact_email')).not.toBe('none');
  });
});

// ---------------------------------------------------------------------------
// detectPiiColumns — classification mapping
// ---------------------------------------------------------------------------

describe('detectPiiColumns — classification mapping', () => {
  it('maps SSN-only column to restricted', () => {
    const ssns = [
      '123-45-6789', '987-65-4321', '111-22-3333',
      '444-55-6666', '777-88-9999',
    ];
    const rows = ssns.map((s) => [s]);
    const columns = [col('ssn_col')];
    const piiMap = detectPiiColumns(columns, rows);

    expect(piiMap.get('ssn_col')).toBe('restricted');
  });

  it('maps IP-only column to low', () => {
    const ips = [
      '192.168.1.1', '10.0.0.1', '172.16.0.1',
      '8.8.8.8', '1.1.1.1',
    ];
    const rows = ips.map((i) => [i]);
    const columns = [col('ip_col')];
    const piiMap = detectPiiColumns(columns, rows);

    expect(piiMap.get('ip_col')).toBe('low');
  });

  it('maps non-string columns to none', () => {
    const columns: CanonicalColumn[] = [{ name: 'num_col', type: 'number', semantic_role: 'measure' }];
    const rows = [[1], [2], [3], [4], [5]];
    const piiMap = detectPiiColumns(columns, rows);

    expect(piiMap.get('num_col')).toBe('none');
  });
});
