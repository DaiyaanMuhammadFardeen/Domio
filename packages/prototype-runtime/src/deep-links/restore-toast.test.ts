/**
 * restore-toast tests — verifies that the helper produces the
 * correct kind, message, CTA, and auto-dismiss policy for each
 * path the viewer hits on boot.
 */

import { describe, expect, it } from 'vitest';
import {
  expiredToast,
  partialToast,
  resumeToast,
  RESUME_AUTO_DISMISS_MS,
  type RestoreToastKind,
} from './restore-toast.js';

describe('resumeToast', () => {
  it('produces a polite, auto-dismissing resume toast ≤ 1.5 s', () => {
    const props = resumeToast();
    expect(props.kind).toBe<RestoreToastKind>('resume');
    expect(props.ariaLive).toBe('polite');
    expect(props.autoDismissMs).toBeLessThanOrEqual(1500);
    expect(props.autoDismissMs).toBe(RESUME_AUTO_DISMISS_MS);
    expect(props.message).toMatch(/Resuming/);
    expect(props.testId).toBe('m7-restore-resume');
  });

  it('honours a caller-supplied message', () => {
    const props = resumeToast('Loading slide 7');
    expect(props.message).toBe('Loading slide 7');
  });
});

describe('expiredToast', () => {
  it('is assertive and sticky (no auto-dismiss)', () => {
    const props = expiredToast();
    expect(props.kind).toBe('expired');
    expect(props.ariaLive).toBe('assertive');
    expect(props.autoDismissMs).toBe(0);
    expect(props.cta).toBe('Open at default');
    expect(props.ctaTarget).toBe('restore:default');
    expect(props.message).toMatch(/expired/);
  });
});

describe('partialToast', () => {
  it('lists up to 3 missing variable names and continues sticky', () => {
    const props = partialToast(['A', 'B', 'C', 'D', 'E']);
    expect(props.kind).toBe('partial');
    expect(props.ariaLive).toBe('polite');
    expect(props.autoDismissMs).toBe(0);
    expect(props.message).toMatch(/Missing: A, B, C…/);
    expect(props.cta).toBe('Continue');
  });

  it('omits the summary when no missing names are given', () => {
    const props = partialToast();
    expect(props.message).not.toMatch(/Missing:/);
  });
});
