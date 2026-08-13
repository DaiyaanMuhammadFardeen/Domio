/**
 * Captions tests — S5.5.
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Captions } from './Captions';

describe('Captions', () => {
  it('renders the current text when enabled', () => {
    render(
      <Captions
        enabled={true}
        mode="captions"
        currentText="Hello world"
        interimText=""
        isFinal={true}
      />,
    );
    const text = screen.getByTestId('captions-text');
    expect(text.textContent).toBe('Hello world');
  });

  it('shows interim text when isFinal is false', () => {
    render(
      <Captions
        enabled={true}
        mode="captions"
        currentText=""
        interimText="partial"
        isFinal={false}
      />,
    );
    const interim = screen.getByTestId('captions-interim');
    expect(interim.textContent).toBe('partial');
  });

  it('shows the audio indicator when mode includes audio', () => {
    render(
      <Captions
        enabled={true}
        mode="both"
        currentText="hi"
        interimText=""
        isFinal={true}
      />,
    );
    expect(screen.getByTestId('captions-audio-indicator')).toBeInTheDocument();
  });

  it('hides the audio indicator when mode is captions only', () => {
    render(
      <Captions
        enabled={true}
        mode="captions"
        currentText="hi"
        interimText=""
        isFinal={true}
      />,
    );
    expect(screen.queryByTestId('captions-audio-indicator')).toBeNull();
  });

  it('shows a disabled bar when enabled is false', () => {
    render(
      <Captions
        enabled={false}
        mode="captions"
        currentText="hi"
        interimText=""
        isFinal={true}
      />,
    );
    expect(screen.getByTestId('captions-disabled')).toBeInTheDocument();
  });

  it('falls back to a placeholder when no text is provided', () => {
    render(
      <Captions
        enabled={true}
        mode="captions"
        currentText=""
        interimText=""
        isFinal={true}
      />,
    );
    expect(screen.getByText(/waiting for captions/)).toBeInTheDocument();
  });
});
