/**
 * SlowConnectionBanner tests.
 *
 * Per Wave 5 §S5.9 spec:
 *   render with visible=true → banner shown
 *   click dismiss → onDismiss called
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SlowConnectionBanner } from './SlowConnectionBanner';

describe('SlowConnectionBanner', () => {
  it('renders nothing when visible=false', () => {
    const { container } = render(<SlowConnectionBanner visible={false} onDismiss={() => undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the banner when visible=true', () => {
    render(<SlowConnectionBanner visible={true} onDismiss={() => undefined} />);
    const banner = screen.getByTestId('slow-connection-banner');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent(/Slow connection/i);
    expect(banner).toHaveAttribute('role', 'status');
  });

  it('clicking dismiss fires onDismiss', () => {
    const onDismiss = vi.fn();
    render(<SlowConnectionBanner visible={true} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByTestId('slow-connection-dismiss'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});