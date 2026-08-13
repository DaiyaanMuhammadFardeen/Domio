/**
 * QA widget test — type a question and submit.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QA } from './QA';
import { buildProps, resetBus } from './test-utils';

describe('QA widget', () => {
  beforeEach(() => {
    resetBus();
  });

  it('submits trimmed question on form submit', () => {
    const onSubmit = vi.fn();
    const props = buildProps('qa', 'w1', {}, { onSubmit });
    render(<QA.Component {...props} />);
    const input = screen.getByTestId('qa-input') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'Why?' } });
    fireEvent.click(screen.getByTestId('qa-submit'));
    expect(onSubmit).toHaveBeenCalledWith({ question: 'Why?' });
  });

  it('does not submit an empty question', () => {
    const onSubmit = vi.fn();
    const props = buildProps('qa', 'w1', {}, { onSubmit });
    render(<QA.Component {...props} />);
    fireEvent.click(screen.getByTestId('qa-submit'));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});