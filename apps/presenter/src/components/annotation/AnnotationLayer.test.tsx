/**
 * AnnotationLayer tests — S4.3.
 *
 * Verifies the composite toolbar surfaces all five tool buttons, that
 * each emits onToolChange with its kind when clicked, and that the
 * "clear" button resets the active state.
 */

import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AnnotationLayer } from './AnnotationLayer';

describe('AnnotationLayer', () => {
  it('renders all five tool buttons', () => {
    render(<AnnotationLayer active={null} onToolChange={vi.fn()} />);
    expect(screen.getByTestId('annotation-tool-pen')).toBeInTheDocument();
    expect(screen.getByTestId('annotation-tool-highlighter')).toBeInTheDocument();
    expect(screen.getByTestId('annotation-tool-spotlight')).toBeInTheDocument();
    expect(screen.getByTestId('annotation-tool-zoom')).toBeInTheDocument();
    expect(screen.getByTestId('annotation-tool-blur')).toBeInTheDocument();
  });

  it('does not show the clear button when no tool is active', () => {
    render(<AnnotationLayer active={null} onToolChange={vi.fn()} />);
    expect(screen.queryByTestId('annotation-layer-clear')).toBeNull();
  });

  it('shows the clear button when a tool is active', () => {
    render(<AnnotationLayer active="pen" onToolChange={vi.fn()} />);
    expect(screen.getByTestId('annotation-layer-clear')).toBeInTheDocument();
  });

  it('marks the active tool as pressed', () => {
    render(<AnnotationLayer active="highlighter" onToolChange={vi.fn()} />);
    expect(screen.getByTestId('annotation-tool-highlighter').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('annotation-tool-pen').getAttribute('aria-pressed')).toBe('false');
  });

  it('emits the correct kind when each tool button is clicked', () => {
    const onToolChange = vi.fn();
    render(<AnnotationLayer active={null} onToolChange={onToolChange} />);

    fireEvent.click(screen.getByTestId('annotation-tool-pen'));
    expect(onToolChange).toHaveBeenLastCalledWith('pen');

    fireEvent.click(screen.getByTestId('annotation-tool-highlighter'));
    expect(onToolChange).toHaveBeenLastCalledWith('highlighter');

    fireEvent.click(screen.getByTestId('annotation-tool-spotlight'));
    expect(onToolChange).toHaveBeenLastCalledWith('spotlight');

    fireEvent.click(screen.getByTestId('annotation-tool-zoom'));
    expect(onToolChange).toHaveBeenLastCalledWith('zoom');

    fireEvent.click(screen.getByTestId('annotation-tool-blur'));
    expect(onToolChange).toHaveBeenLastCalledWith('blur');
  });

  it('emits null when the clear button is clicked', () => {
    const onToolChange = vi.fn();
    render(<AnnotationLayer active="zoom" onToolChange={onToolChange} />);
    fireEvent.click(screen.getByTestId('annotation-layer-clear'));
    expect(onToolChange).toHaveBeenCalledWith(null);
  });

  it('disables all tool buttons when disabled', () => {
    render(<AnnotationLayer active={null} disabled onToolChange={vi.fn()} />);
    expect((screen.getByTestId('annotation-tool-pen') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('annotation-tool-blur') as HTMLButtonElement).disabled).toBe(true);
  });
});