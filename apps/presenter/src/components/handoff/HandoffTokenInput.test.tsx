/**
 * HandoffTokenInput tests — S4.7.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HandoffTokenInput } from './HandoffTokenInput';

describe('HandoffTokenInput', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('disables submit until a valid token is entered', () => {
    render(
      <HandoffTokenInput
        sessionId="s1"
        etag='"v1"'
        onClose={vi.fn()}
        onClaim={vi.fn()}
      />,
    );
    expect((screen.getByTestId('handoff-token-input-submit') as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByTestId('handoff-token-input-field'), {
      target: { value: 'short' }, // 5 chars — too short
    });
    expect((screen.getByTestId('handoff-token-input-submit') as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByTestId('handoff-token-input-field'), {
      target: { value: 'longenough' }, // 10 chars — valid
    });
    expect((screen.getByTestId('handoff-token-input-submit') as HTMLButtonElement).disabled).toBe(false);
  });

  it('calls onClose when the cancel button is clicked', () => {
    const onClose = vi.fn();
    render(
      <HandoffTokenInput
        sessionId="s1"
        etag='"v1"'
        onClose={onClose}
        onClaim={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('handoff-token-input-cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('submits the token via fetch and calls onClaim on success', async () => {
    const onClaim = vi.fn();
    const onClose = vi.fn();
    render(
      <HandoffTokenInput
        sessionId="s1"
        etag='"v1"'
        onClose={onClose}
        onClaim={onClaim}
      />,
    );
    fireEvent.change(screen.getByTestId('handoff-token-input-field'), {
      target: { value: 'validtoken123' },
    });
    await fireEvent.click(screen.getByTestId('handoff-token-input-submit'));
    await waitFor(() => {
      expect(onClaim).toHaveBeenCalled();
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('surfaces a server error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('forbidden', { status: 403 })),
    );
    render(
      <HandoffTokenInput
        sessionId="s1"
        etag='"v1"'
        onClose={vi.fn()}
        onClaim={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByTestId('handoff-token-input-field'), {
      target: { value: 'validtoken123' },
    });
    await fireEvent.click(screen.getByTestId('handoff-token-input-submit'));
    await waitFor(() => {
      expect(screen.getByTestId('handoff-token-input-error')).toBeInTheDocument();
    });
  });
});