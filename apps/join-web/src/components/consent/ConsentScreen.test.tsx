/**
 * ConsentScreen tests — S5.10.
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ConsentScreen, type ConsentCategory } from './ConsentScreen';

const CATEGORIES: ReadonlyArray<ConsentCategory> = [
  {
    id: 'engagement',
    label: 'Engagement metrics',
    description: 'How often you interact with widgets.',
    required: true,
  },
  {
    id: 'feedback',
    label: 'Feedback notes',
    description: 'Free-text notes you submit during the session.',
    required: false,
  },
  {
    id: 'analytics',
    label: 'Anonymous analytics',
    description: 'Aggregate, non-identifying product analytics.',
    required: false,
  },
];

describe('ConsentScreen', () => {
  beforeEach(() => {
    if (typeof sessionStorage !== 'undefined') sessionStorage.clear();
  });

  afterEach(() => {
    if (typeof sessionStorage !== 'undefined') sessionStorage.clear();
  });

  it('renders the consent screen with the per-category checkboxes', () => {
    render(<ConsentScreen categories={CATEGORIES} policyVersion="v1" />);
    expect(screen.getByTestId('consent-screen')).toBeInTheDocument();
    expect(screen.getByTestId('consent-check-engagement')).toBeInTheDocument();
    expect(screen.getByTestId('consent-check-feedback')).toBeInTheDocument();
    expect(screen.getByTestId('consent-check-analytics')).toBeInTheDocument();
  });

  it('disables the required checkbox', () => {
    render(<ConsentScreen categories={CATEGORIES} policyVersion="v1" />);
    const required = screen.getByTestId('consent-check-engagement') as HTMLInputElement;
    expect(required.disabled).toBe(true);
    expect(required.checked).toBe(true);
  });

  it('does not disable optional checkboxes', () => {
    render(<ConsentScreen categories={CATEGORIES} policyVersion="v1" />);
    const feedback = screen.getByTestId('consent-check-feedback') as HTMLInputElement;
    const analytics = screen.getByTestId('consent-check-analytics') as HTMLInputElement;
    expect(feedback.disabled).toBe(false);
    expect(analytics.disabled).toBe(false);
    expect(feedback.checked).toBe(false);
    expect(analytics.checked).toBe(false);
  });

  it('persists the choice to sessionStorage on Accept selected', () => {
    render(<ConsentScreen categories={CATEGORIES} policyVersion="v1" />);
    // Optional categories default to OFF. Turn "analytics" ON so we
    // can verify that Accept selected respects the user's per-category
    // toggles (engagement is required, analytics now accepted,
    // feedback remains declined).
    fireEvent.click(screen.getByTestId('consent-check-analytics'));
    fireEvent.click(screen.getByTestId('consent-accept-selected'));
    const raw = sessionStorage.getItem('domio.consent.v1');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw as string) as {
      policy_version: string;
      accepted: ReadonlyArray<string>;
      declined: ReadonlyArray<string>;
    };
    expect(parsed.policy_version).toBe('v1');
    expect(parsed.accepted).toContain('engagement'); // required
    expect(parsed.accepted).toContain('analytics'); // toggled on
    expect(parsed.declined).toContain('feedback'); // left off
  });

  it('accepts all on Accept all', () => {
    render(<ConsentScreen categories={CATEGORIES} policyVersion="v1" />);
    fireEvent.click(screen.getByTestId('consent-accept-all'));
    const raw = sessionStorage.getItem('domio.consent.v1');
    const parsed = JSON.parse(raw as string) as { accepted: ReadonlyArray<string> };
    expect(parsed.accepted).toEqual(
      expect.arrayContaining(['engagement', 'feedback', 'analytics']),
    );
  });

  it('fires onPersist with the choice', () => {
    let captured: { policy_version: string; accepted: ReadonlyArray<string> } | null = null;
    render(
      <ConsentScreen
        categories={CATEGORIES}
        policyVersion="v1"
        onPersist={(c) => {
          captured = { policy_version: c.policy_version, accepted: c.accepted };
        }}
      />,
    );
    fireEvent.click(screen.getByTestId('consent-accept-all'));
    expect(captured).not.toBeNull();
    expect(captured!.policy_version).toBe('v1');
    expect(captured!.accepted.length).toBe(3);
  });
});
