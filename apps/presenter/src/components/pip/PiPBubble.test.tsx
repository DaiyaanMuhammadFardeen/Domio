/**
 * PiPBubble tests — S4.6.
 *
 * Camera calls fail in jsdom so we test the structural shell: the
 * bubble renders a video element + resize handle when not disabled,
 * and renders nothing when disabled.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PiPBubble } from './PiPBubble';

describe('PiPBubble', () => {
  it('renders nothing when disabled', () => {
    render(<PiPBubble disabled />);
    expect(screen.queryByTestId('pip-bubble')).toBeNull();
  });

  it('renders the bubble with a video element when enabled', () => {
    render(<PiPBubble />);
    expect(screen.getByTestId('pip-bubble')).toBeInTheDocument();
    expect(screen.getByTestId('pip-bubble-video')).toBeInTheDocument();
  });

  it('renders a resize handle', () => {
    render(<PiPBubble />);
    expect(screen.getByTestId('pip-bubble-resize')).toBeInTheDocument();
  });

  it('renders a virtual-background canvas when virtualBackground is true', () => {
    render(<PiPBubble virtualBackground />);
    expect(screen.getByTestId('pip-bubble-vb-canvas')).toBeInTheDocument();
  });
});