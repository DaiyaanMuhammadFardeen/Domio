/**
 * ShareStateButton tests.
 *
 * Phase 10 M7.2. Verifies the toolbar button mounts, encodes the
 * current state via StateEncoder, and copies the URL to the
 * clipboard (or surfaces a fallback error).
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ShareStateButton, type ShareStateButtonCurrentState } from './ShareStateButton';

const SAMPLE_STATE: ShareStateButtonCurrentState = {
  deck_id: '01H000000000000000000000D1',
  slide_id: '01H000000000000000000000S7',
  path_stack: ['01H000000000000000000000S1', '01H000000000000000000000S7'],
  overlay_stack: ['01H000000000000000000000O1'],
  var_snapshot: [
    { name: 'TIER', value: 'bear', visibility: 'deck_public', scope: 'deck' },
  ],
  device_frame_state: { kind: 'iphone', orientation: 'portrait' },
  scenario: 'bear',
  form_drafts: { 'form-1': { email: 'a@b.c' } },
};

function setup(overrides: Partial<React.ComponentProps<typeof ShareStateButton>> = {}) {
  const getState: () => ShareStateButtonCurrentState = () => SAMPLE_STATE;
  const copyToClipboard = vi.fn<(text: string) => Promise<boolean>>(async () => true);
  const renderQr = vi.fn<(url: string) => string | null>(() => '<svg></svg>');
  const props: React.ComponentProps<typeof ShareStateButton> = {
    getState,
    copyToClipboard,
    renderQr,
    ...overrides,
  };
  return { props, getState, copyToClipboard, renderQr };
}

describe('ShareStateButton', () => {
  it('renders the toolbar button with the share label', () => {
    const { props } = setup();
    render(<ShareStateButton {...props} />);
    expect(screen.getByTestId('m7-share-button')).toBeInTheDocument();
    expect(screen.getByTestId('m7-share-button')).toHaveTextContent('Share current state');
  });

  it('encodes the current state and copies the URL on click', async () => {
    const { props, copyToClipboard } = setup();
    render(<ShareStateButton {...props} />);
    fireEvent.click(screen.getByTestId('m7-share-button'));
    await waitFor(() => {
      expect(copyToClipboard).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByTestId('m7-share-copied')).toBeInTheDocument();
  });

  it('shows a QR block when renderQr returns markup', async () => {
    const { props, renderQr } = setup();
    render(<ShareStateButton {...props} />);
    fireEvent.click(screen.getByTestId('m7-share-button'));
    await waitFor(() => {
      expect(renderQr).toHaveBeenCalled();
    });
    expect(screen.getByTestId('m7-share-qr')).toBeInTheDocument();
  });

  it('surfaces an error state when clipboard write fails', async () => {
    const { props } = setup({ copyToClipboard: vi.fn(async () => false) });
    render(<ShareStateButton {...props} />);
    fireEvent.click(screen.getByTestId('m7-share-button'));
    await waitFor(() => {
      expect(screen.getByTestId('m7-share-error')).toBeInTheDocument();
    });
  });

  it('emits a URL with a base64url token (encodes the same kid/key shape)', async () => {
    const { props, copyToClipboard } = setup();
    render(<ShareStateButton {...props} />);
    fireEvent.click(screen.getByTestId('m7-share-button'));
    await waitFor(() => {
      expect(copyToClipboard).toHaveBeenCalled();
    });
    const call = copyToClipboard.mock.calls[0];
    expect(call).toBeDefined();
    const url = (call as unknown as [string])[0];
    expect(url).toMatch(/\/d\?token=[A-Za-z0-9_-]+$/);
  });

  it('produces a token that is non-empty and base64url-shaped', async () => {
    const { props, copyToClipboard } = setup();
    render(<ShareStateButton {...props} />);
    fireEvent.click(screen.getByTestId('m7-share-button'));
    await waitFor(() => {
      expect(copyToClipboard).toHaveBeenCalled();
    });
    const call = copyToClipboard.mock.calls[0];
    expect(call).toBeDefined();
    const url = (call as unknown as [string])[0];
    const token = url.split('token=')[1] ?? '';
    expect(token.length).toBeGreaterThan(20);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});