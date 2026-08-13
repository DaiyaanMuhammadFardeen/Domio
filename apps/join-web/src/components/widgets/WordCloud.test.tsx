/**
 * WordCloud widget test — type and submit.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { WordCloud } from './WordCloud';
import { buildProps, resetBus } from './test-utils';

describe('WordCloud widget', () => {
  beforeEach(() => {
    resetBus();
  });

  it('submits trimmed text on form submit', () => {
    const onSubmit = vi.fn();
    const props = buildProps('word_cloud', 'w1', {}, { onSubmit });
    render(<WordCloud.Component {...props} />);
    const input = screen.getByTestId('word-cloud-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'hello' } });
    fireEvent.submit(screen.getByTestId('word-cloud-submit'));
    expect(onSubmit).toHaveBeenCalledWith({ text: 'hello' });
  });

  it('does not submit empty text', () => {
    const onSubmit = vi.fn();
    const props = buildProps('word_cloud', 'w1', {}, { onSubmit });
    render(<WordCloud.Component {...props} />);
    fireEvent.submit(screen.getByTestId('word-cloud-submit'));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
