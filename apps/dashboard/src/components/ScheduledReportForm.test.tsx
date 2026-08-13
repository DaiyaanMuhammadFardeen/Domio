import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ScheduledReportForm } from './ScheduledReportForm';

describe('ScheduledReportForm', () => {
  it('renders all input fields and Save button', () => {
    render(<ScheduledReportForm workspaceId="ws-demo" />);
    expect(screen.getByTestId('schedule-name')).toBeInTheDocument();
    expect(screen.getByTestId('schedule-frequency')).toBeInTheDocument();
    expect(screen.getByTestId('schedule-format')).toBeInTheDocument();
    expect(screen.getByTestId('schedule-channel')).toBeInTheDocument();
    expect(screen.getByTestId('schedule-target')).toBeInTheDocument();
    expect(screen.getByTestId('schedule-save')).toBeInTheDocument();
  });

  it('fills the form and submits via the parent callback', async () => {
    const onCreate = vi.fn(async () => {});
    render(<ScheduledReportForm workspaceId="ws-demo" onCreate={onCreate} />);

    fireEvent.change(screen.getByTestId('schedule-name'), {
      target: { value: 'Weekly QBR pack' },
    });
    fireEvent.change(screen.getByTestId('schedule-frequency'), {
      target: { value: 'weekly' },
    });
    fireEvent.change(screen.getByTestId('schedule-format'), {
      target: { value: 'pdf' },
    });
    fireEvent.change(screen.getByTestId('schedule-channel'), {
      target: { value: 'slack' },
    });
    fireEvent.change(screen.getByTestId('schedule-target'), {
      target: { value: '#analytics' },
    });

    fireEvent.click(screen.getByTestId('schedule-save'));

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledTimes(1);
    });
    expect(onCreate).toHaveBeenCalledWith({
      name: 'Weekly QBR pack',
      frequency: 'weekly',
      format: 'pdf',
      channel: 'slack',
      target: '#analytics',
    });
    expect(screen.getByTestId('schedule-saved')).toBeInTheDocument();
  });

  it('surfaces validation errors when name or target are missing', async () => {
    const onCreate = vi.fn();
    render(<ScheduledReportForm workspaceId="ws-demo" onCreate={onCreate} />);

    fireEvent.click(screen.getByTestId('schedule-save'));

    await waitFor(() => {
      expect(onCreate).not.toHaveBeenCalled();
    });
    expect(screen.getByText(/Name is required/)).toBeInTheDocument();
    expect(screen.getByText(/Channel target is required/)).toBeInTheDocument();
  });
});