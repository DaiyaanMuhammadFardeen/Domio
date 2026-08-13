/**
 * NoteInput tests — Wave 5 §S5.6.
 */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { NoteInput } from './NoteInput';

describe('NoteInput', () => {
  it('renders the initial value and reflects it in the counter', () => {
    render(<NoteInput value="hello" onChange={vi.fn()} />);
    const textarea = screen.getByTestId('note-input') as HTMLTextAreaElement;
    expect(textarea.value).toBe('hello');
    expect(screen.getByTestId('note-input-count').textContent).toBe('5 / 500');
  });

  it('calls onChange with the new value when typed text is within the limit', () => {
    const onChange = vi.fn();
    render(<NoteInput value="hello" onChange={onChange} />);
    fireEvent.change(screen.getByTestId('note-input'), { target: { value: 'hello world' } });
    expect(onChange).toHaveBeenCalledWith('hello world');
  });

  it('rejects content longer than the cap and shows the rejection banner', () => {
    const onChange = vi.fn();
    render(<NoteInput value="" onChange={onChange} maxLength={500} />);
    const big = 'x'.repeat(501);
    fireEvent.change(screen.getByTestId('note-input'), { target: { value: big } });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId('note-input-rejected')).toBeInTheDocument();
  });

  it('uses a custom maxLength when supplied', () => {
    render(<NoteInput value="abc" onChange={vi.fn()} maxLength={10} />);
    expect(screen.getByTestId('note-input-count').textContent).toBe('3 / 10');
  });
});