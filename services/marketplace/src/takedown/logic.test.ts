/**
 * Takedown logic tests (Phase 19 Wave 4 — WS-MKT-8).
 *
 * Tests for takedown state machine, validation, and trust scoring.
 */

import { describe, it, expect } from 'vitest';
import {
  TAKEDOWN_TRANSITIONS,
  validateTakedownTransition,
  validateTakedownInput,
  fileTakedownBody,
  resolveBody,
  dismissBody,
  counterNoticeBody,
  computeTrustScore,
} from './logic.js';
import { InvalidTakedownTransitionError } from './types.js';
import type { TakedownStatus } from './types.js';

describe('TAKEDOWN_TRANSITIONS', () => {
  // Valid transitions
  it('received → in_review', () => {
    expect(TAKEDOWN_TRANSITIONS.received).toContain('in_review');
  });

  it('in_review → confirmed', () => {
    expect(TAKEDOWN_TRANSITIONS.in_review).toContain('confirmed');
  });

  it('in_review → dismissed', () => {
    expect(TAKEDOWN_TRANSITIONS.in_review).toContain('dismissed');
  });

  it('confirmed → counter_notice', () => {
    expect(TAKEDOWN_TRANSITIONS.confirmed).toContain('counter_notice');
  });

  it('confirmed → resolved', () => {
    expect(TAKEDOWN_TRANSITIONS.confirmed).toContain('resolved');
  });

  it('dismissed → resolved', () => {
    expect(TAKEDOWN_TRANSITIONS.dismissed).toContain('resolved');
  });

  it('counter_notice → resolved', () => {
    expect(TAKEDOWN_TRANSITIONS.counter_notice).toContain('resolved');
  });

  // Invalid transitions
  it('received cannot go to confirmed', () => {
    expect(TAKEDOWN_TRANSITIONS.received).not.toContain('confirmed');
  });

  it('received cannot go to resolved', () => {
    expect(TAKEDOWN_TRANSITIONS.received).not.toContain('resolved');
  });

  it('in_review cannot go to counter_notice', () => {
    expect(TAKEDOWN_TRANSITIONS.in_review).not.toContain('counter_notice');
  });

  it('resolved has no transitions', () => {
    expect(TAKEDOWN_TRANSITIONS.resolved).toHaveLength(0);
  });

  it('covers all 6 statuses', () => {
    const statuses: TakedownStatus[] = [
      'received',
      'in_review',
      'confirmed',
      'dismissed',
      'counter_notice',
      'resolved',
    ];
    for (const status of statuses) {
      expect(TAKEDOWN_TRANSITIONS).toHaveProperty(status);
    }
  });
});

describe('validateTakedownTransition', () => {
  it('allows valid transition', () => {
    expect(() => validateTakedownTransition('received', 'in_review')).not.toThrow();
  });

  it('throws for invalid transition', () => {
    expect(() => validateTakedownTransition('received', 'confirmed')).toThrow(
      InvalidTakedownTransitionError,
    );
  });
});

describe('validateTakedownInput', () => {
  it('accepts valid dmca input', () => {
    expect(() =>
      validateTakedownInput({
        kind: 'dmca',
        statement: 'This content infringes my copyright.',
      }),
    ).not.toThrow();
  });

  it('accepts valid trademark input', () => {
    expect(() =>
      validateTakedownInput({
        kind: 'trademark',
        statement: 'This uses my trademark without permission.',
      }),
    ).not.toThrow();
  });

  it('accepts valid policy input', () => {
    expect(() =>
      validateTakedownInput({
        kind: 'policy',
        statement: 'This violates community guidelines.',
      }),
    ).not.toThrow();
  });

  it('accepts input with valid evidence URL', () => {
    expect(() =>
      validateTakedownInput({
        kind: 'dmca',
        statement: 'Evidence attached.',
        evidenceUrl: 'https://example.com/evidence.pdf',
      }),
    ).not.toThrow();
  });

  it('throws for missing kind', () => {
    expect(() =>
      validateTakedownInput({
        kind: '',
        statement: 'Test',
      }),
    ).toThrow('kind is required');
  });

  it('throws for invalid kind', () => {
    expect(() =>
      validateTakedownInput({
        kind: 'invalid',
        statement: 'Test',
      }),
    ).toThrow('Invalid takedown kind');
  });

  it('throws for empty statement', () => {
    expect(() =>
      validateTakedownInput({
        kind: 'dmca',
        statement: '',
      }),
    ).toThrow('statement is required');
  });

  it('throws for whitespace-only statement', () => {
    expect(() =>
      validateTakedownInput({
        kind: 'dmca',
        statement: '   ',
      }),
    ).toThrow('statement is required');
  });

  it('throws for statement > 4000 chars', () => {
    expect(() =>
      validateTakedownInput({
        kind: 'dmca',
        statement: 'x'.repeat(4001),
      }),
    ).toThrow('statement must be at most 4000 characters');
  });

  it('throws for invalid evidence URL', () => {
    expect(() =>
      validateTakedownInput({
        kind: 'dmca',
        statement: 'Test',
        evidenceUrl: 'not-a-url',
      }),
    ).toThrow('evidence_url must be a valid URL');
  });

  it('throws for ftp evidence URL', () => {
    expect(() =>
      validateTakedownInput({
        kind: 'dmca',
        statement: 'Test',
        evidenceUrl: 'ftp://example.com/file.pdf',
      }),
    ).toThrow('evidence_url must use http or https protocol');
  });

  it('accepts null evidence URL', () => {
    expect(() =>
      validateTakedownInput({
        kind: 'dmca',
        statement: 'Test',
        evidenceUrl: null,
      }),
    ).not.toThrow();
  });
});

describe('fileTakedownBody', () => {
  it('returns received status and submitted_at', () => {
    const body = fileTakedownBody();
    expect(body.status).toBe('received');
    expect(body.submittedAt).toBeInstanceOf(Date);
  });
});

describe('resolveBody', () => {
  it('returns resolved status for confirmed', () => {
    const body = resolveBody('confirmed');
    expect(body.status).toBe('resolved');
    expect(body.resolvedAt).toBeInstanceOf(Date);
    expect(body.listingStatus).toBe('removed');
  });

  it('throws for non-confirmed status', () => {
    expect(() => resolveBody('in_review')).toThrow(InvalidTakedownTransitionError);
  });
});

describe('dismissBody', () => {
  it('returns resolved status for in_review', () => {
    const body = dismissBody('in_review');
    expect(body.status).toBe('resolved');
    expect(body.resolvedAt).toBeInstanceOf(Date);
  });

  it('throws for non-in_review status', () => {
    expect(() => dismissBody('confirmed')).toThrow(InvalidTakedownTransitionError);
  });
});

describe('counterNoticeBody', () => {
  it('returns counter_notice status for confirmed', () => {
    const body = counterNoticeBody('confirmed');
    expect(body.status).toBe('counter_notice');
  });

  it('throws for non-confirmed status', () => {
    expect(() => counterNoticeBody('in_review')).toThrow(InvalidTakedownTransitionError);
  });
});

describe('computeTrustScore', () => {
  it('returns 0 for empty signals', () => {
    expect(computeTrustScore({})).toBe(0);
  });

  it('computes weighted average from signals', () => {
    const score = computeTrustScore({
      malware_scan: 1,
      pricing_anomaly: 0,
      review_sentiment: 1,
      seller_history: 1,
      listing_quality: 1,
    });
    // (1*0.3 + 0*0.2 + 1*0.25 + 1*0.15 + 1*0.1) / (0.3+0.2+0.25+0.15+0.1)
    // = (0.3 + 0 + 0.25 + 0.15 + 0.1) / 1.0 = 0.8
    expect(score).toBe(0.8);
  });

  it('rounds to 4 decimal places', () => {
    const score = computeTrustScore({
      malware_scan: 0.5,
    });
    expect(score).toBe(Math.round(((0.5 * 0.3) / 0.3) * 10000) / 10000);
  });

  it('ignores non-numeric signals', () => {
    const score = computeTrustScore({
      malware_scan: 'invalid',
      pricing_anomaly: 1,
    });
    expect(score).toBe(1);
  });

  it('ignores out-of-range signals', () => {
    const score = computeTrustScore({
      malware_scan: 2,
      pricing_anomaly: -1,
    });
    expect(score).toBe(0);
  });
});
