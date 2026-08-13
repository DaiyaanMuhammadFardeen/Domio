import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AlertConfigForm } from './AlertConfigForm';

describe('AlertConfigForm', () => {
  it('renders metric, threshold, channel fields', () => {
    render(<AlertConfigForm onSave={vi.fn()} />);
    expect(screen.getByTestId('alert-metric')).toBeInTheDocument();
    expect(screen.getByTestId('alert-threshold')).toBeInTheDocument();
    expect(screen.getByTestId('alert-channel')).toBeInTheDocument();
    expect(screen.getByTestId('alert-target')).toBeInTheDocument();
    expect(screen.getByTestId('alert-save')).toBeInTheDocument();
  });

  it('fills the form and submits the parsed payload on Save', async () => {
    const onSave = vi.fn(async () => {});
    render(<AlertConfigForm onSave={onSave} />);

    fireEvent.change(screen.getByTestId('alert-metric'), {
      target: { value: 'bounce_rate' },
    });
    fireEvent.change(screen.getByTestId('alert-comparator'), {
      target: { value: 'above' },
    });
    fireEvent.change(screen.getByTestId('alert-threshold'), {
      target: { value: '0.75' },
    });
    fireEvent.change(screen.getByTestId('alert-channel'), {
      target: { value: 'email' },
    });
    fireEvent.change(screen.getByTestId('alert-target'), {
      target: { value: 'oncall@example.com' },
    });

    fireEvent.click(screen.getByTestId('alert-save'));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });
    expect(onSave).toHaveBeenCalledWith({
      metric: 'bounce_rate',
      comparator: 'above',
      threshold: 0.75,
      channel: 'email',
      target: 'oncall@example.com',
    });
    expect(screen.getByTestId('alert-saved')).toBeInTheDocument();
  });

  it('surfaces a validation error when target is missing', async () => {
    const onSave = vi.fn();
    render(<AlertConfigForm onSave={onSave} />);
    fireEvent.change(screen.getByTestId('alert-target'), {
      target: { value: '   ' },
    });
    fireEvent.click(screen.getByTestId('alert-save'));

    await waitFor(() => {
      expect(onSave).not.toHaveBeenCalled();
    });
    expect(screen.getByText(/Channel target is required/)).toBeInTheDocument();
  });
});
