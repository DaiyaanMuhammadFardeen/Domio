/**
 * Sentiment widget test — click positive, verify onSubmit.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Sentiment } from './Sentiment';
import { buildProps, resetBus } from './test-utils';

describe('Sentiment widget', () => {
  beforeEach(() => {
    resetBus();
  });

  it('renders positive / neutral / negative buttons', () => {
    const props = buildProps('sentiment', 'w1', {});
    render(<Sentiment.Component {...props} />);
    expect(screen.getByTestId('sentiment-positive')).toBeInTheDocument();
    expect(screen.getByTestId('sentiment-neutral')).toBeInTheDocument();
    expect(screen.getByTestId('sentiment-negative')).toBeInTheDocument();
  });

  it('fires onSubmit({sentiment}) when positive is clicked', () => {
    const onSubmit = vi.fn();
    const props = buildProps('sentiment', 'w1', {}, { onSubmit });
    render(<Sentiment.Component {...props} />);
    fireEvent.click(screen.getByTestId('sentiment-positive'));
    expect(onSubmit).toHaveBeenCalledWith({ sentiment: 'positive' });
  });
});
