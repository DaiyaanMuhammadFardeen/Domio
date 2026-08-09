/**
 * @domio/dlp-warn — scanner tests (P20.5 B3).
 *
 * Covers §4.3 test list:
 *   - CC Luhn: valid 4111-1111-1111-1111 triggers warning; invalid 4111-1111-1111-1112 does not.
 *   - Email regex catches standard form; ignores user@localhost.
 *   - SSN regex catches 123-45-6789; ignores 123456789.
 *   - Share with NID-like content shows warning; user can bypass; bypass is audited. (summary.ts)
 *   - Bypass count visible in admin summary.
 *   - Luhn unit tests.
 */

import { describe, it, expect } from 'vitest';
import { DlpScanner, dlpScanner } from './scanner.js';
import { luhnValid } from './luhn.js';
import { summarizeDlpEvents, redactSnippet } from './summary.js';
import type { DlpAuditEvent } from './summary.js';
import { DLP_MAX_INPUT_LENGTH } from './types.js';

describe('luhnValid', () => {
  it('accepts a known-valid Visa test card', () => {
    expect(luhnValid('4111-1111-1111-1111')).toBe(true);
    expect(luhnValid('4111111111111111')).toBe(true);
  });

  it('rejects a valid prefix with an invalid check digit', () => {
    expect(luhnValid('4111-1111-1111-1112')).toBe(false);
  });

  it('rejects too-short input', () => {
    expect(luhnValid('123')).toBe(false);
  });

  it('rejects too-long input', () => {
    expect(luhnValid('12345678901234567890')).toBe(false);
  });
});

describe('DlpScanner — credit card', () => {
  const scanner = new DlpScanner();

  it('flags a valid Luhn credit card', () => {
    const r = scanner.scan('Card: 4111-1111-1111-1111 expires 12/27');
    expect(r.hasMatches).toBe(true);
    expect(r.matchedRuleIds).toContain('credit_card');
    expect(r.matches.some((m) => m.snippet === '4111-1111-1111-1111')).toBe(true);
  });

  it('does not flag a valid prefix with invalid Luhn', () => {
    const r = scanner.scan('Card: 4111-1111-1111-1112');
    expect(r.matchedRuleIds).not.toContain('credit_card');
  });

  it('flags multiple credit cards in one input', () => {
    const r = scanner.scan('Card A: 4111-1111-1111-1111, Card B: 5500-0000-0000-0004');
    const ccMatches = r.matches.filter((m) => m.ruleId === 'credit_card');
    expect(ccMatches.length).toBe(2);
  });

  it('flags space-separated digits if Luhn-valid', () => {
    const r = scanner.scan('Number: 4111 1111 1111 1111');
    expect(r.matchedRuleIds).toContain('credit_card');
  });
});

describe('DlpScanner — email', () => {
  const scanner = new DlpScanner();

  it('flags a standard email', () => {
    const r = scanner.scan('Contact alice@example.com for details');
    expect(r.matchedRuleIds).toContain('email');
  });

  it('ignores user@localhost', () => {
    const r = scanner.scan('Visit user@localhost to test');
    // The regex requires a TLD of 2+ chars, so user@localhost does not match
    expect(r.matchedRuleIds).not.toContain('email');
  });

  it('flags emails with subdomains and plus addressing', () => {
    const r = scanner.scan('Send to alice+filter@mail.corp.example.com please');
    expect(r.matchedRuleIds).toContain('email');
  });
});

describe('DlpScanner — US SSN', () => {
  const scanner = new DlpScanner();

  it('flags 3-2-4 SSN format', () => {
    const r = scanner.scan('SSN: 123-45-6789');
    expect(r.matchedRuleIds).toContain('us_ssn');
  });

  it('does not flag 9 consecutive digits without dashes', () => {
    const r = scanner.scan('Account number: 123456789');
    expect(r.matchedRuleIds).not.toContain('us_ssn');
  });
});

describe('DlpScanner — combined', () => {
  it('returns empty result for benign text', () => {
    const r = dlpScanner.scan('Just a normal sentence about presentations.');
    expect(r.hasMatches).toBe(false);
    expect(r.matches).toHaveLength(0);
  });

  it('returns all matches when multiple rule types trigger', () => {
    const r = dlpScanner.scan('Contact alice@example.com, SSN 123-45-6789, card 4111-1111-1111-1111.');
    expect(r.matchedRuleIds).toEqual(expect.arrayContaining(['email', 'us_ssn', 'credit_card']));
  });

  it('respects per-rule match cap', () => {
    const scanner = dlpScanner.withCaps({ email: 2 });
    const text = 'a@x.com b@x.com c@x.com d@x.com e@x.com';
    const r = scanner.scan(text);
    const emailMatches = r.matches.filter((m) => m.ruleId === 'email');
    expect(emailMatches.length).toBe(2);
  });

  it('rejects non-string input', () => {
    expect(() => dlpScanner.scan(123 as unknown as string)).toThrow(/must be a string/);
  });

  it('rejects oversized input', () => {
    const huge = 'a'.repeat(DLP_MAX_INPUT_LENGTH + 1);
    expect(() => dlpScanner.scan(huge)).toThrow(/exceeds max/);
  });

  it('returns matches sorted by index', () => {
    const r = dlpScanner.scan('SSN 123-45-6789 then alice@example.com then card 4111-1111-1111-1111.');
    for (let i = 1; i < r.matches.length; i++) {
      expect(r.matches[i]!.index).toBeGreaterThanOrEqual(r.matches[i - 1]!.index);
    }
  });
});

describe('summarizeDlpEvents', () => {
  const now = new Date('2026-08-01T12:00:00Z');

  function ev(action: string, daysAgo: number, ruleIds: string[] = []): DlpAuditEvent {
    return {
      action,
      createdAt: new Date(now.getTime() - daysAgo * 86_400_000),
      metadata: { matchedRuleIds: ruleIds },
    };
  }

  it('counts warns and bypasses within the window', () => {
    const events = [
      ev('dlp.warning_shown', 1, ['credit_card']),
      ev('dlp.warning_shown', 2, ['email']),
      ev('dlp.bypass_acknowledged', 1),
      ev('dlp.bypass_acknowledged', 3),
    ];
    const s = summarizeDlpEvents(events, 7, now);
    expect(s.warnedCount).toBe(2);
    expect(s.bypassedCount).toBe(2);
    expect(s.bypassRate).toBe(1);
  });

  it('excludes events outside the window', () => {
    const events = [
      ev('dlp.warning_shown', 10, ['credit_card']), // outside 7-day window
      ev('dlp.warning_shown', 1, ['email']),
    ];
    const s = summarizeDlpEvents(events, 7, now);
    expect(s.warnedCount).toBe(1);
  });

  it('aggregates by rule', () => {
    const events = [
      ev('dlp.warning_shown', 1, ['credit_card', 'email']),
      ev('dlp.warning_shown', 1, ['email']),
      ev('dlp.warning_shown', 1, ['us_ssn']),
    ];
    const s = summarizeDlpEvents(events, 7, now);
    expect(s.byRule.credit_card).toBe(1);
    expect(s.byRule.email).toBe(2);
    expect(s.byRule.us_ssn).toBe(1);
  });

  it('zero events → zero bypass rate', () => {
    const s = summarizeDlpEvents([], 7, now);
    expect(s.warnedCount).toBe(0);
    expect(s.bypassedCount).toBe(0);
    expect(s.bypassRate).toBe(0);
  });

  it('ignores unknown action names', () => {
    const events = [ev('deck.shared', 1)];
    const s = summarizeDlpEvents(events, 7, now);
    expect(s.warnedCount).toBe(0);
  });
});

describe('redactSnippet', () => {
  it('returns the redacted placeholder', () => {
    expect(redactSnippet('4111-1111-1111-1111')).toBe('████████');
  });
});