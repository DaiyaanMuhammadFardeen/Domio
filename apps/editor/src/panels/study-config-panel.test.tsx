import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  StudyConfigPanel,
  type StudyConfig,
} from './study-config-panel';

const CONFIG: StudyConfig = {
  samplingRate: 0.5,
  retentionDays: 30,
  consent: 'opt_in',
  redactionFields: ['email'],
  abVariants: [
    { name: 'control', weight: 0.5 },
    { name: 'treatment', weight: 0.5 },
  ],
  anonymousIps: true,
};

function defaultProps(overrides: Partial<React.ComponentProps<typeof StudyConfigPanel>> = {}): React.ComponentProps<typeof StudyConfigPanel> {
  return {
    config: CONFIG,
    onChange: vi.fn(),
    ...overrides,
  } as React.ComponentProps<typeof StudyConfigPanel>;
}

describe('StudyConfigPanel', () => {
  it('renders the panel header', () => {
    render(<StudyConfigPanel {...defaultProps()} />);
    expect(screen.getByRole('heading', { name: 'Study configuration' })).toBeInTheDocument();
  });

  it('shows the initial sampling rate as a percentage', () => {
    render(<StudyConfigPanel {...defaultProps()} />);
    const slider = screen.getByTestId('m5-study-sampling-input');
    expect((slider as HTMLInputElement).value).toBe('50');
  });

  it('updates the sampling rate when the slider moves', () => {
    const onChange = vi.fn();
    render(<StudyConfigPanel {...defaultProps({ onChange })} />);
    fireEvent.change(screen.getByTestId('m5-study-sampling-input'), { target: { value: '25' } });
    expect(onChange).toHaveBeenCalledWith({ ...CONFIG, samplingRate: 0.25 });
  });

  it('clamps the sampling rate to [0, 1]', () => {
    const onChange = vi.fn();
    render(<StudyConfigPanel {...defaultProps({ onChange })} />);
    fireEvent.change(screen.getByTestId('m5-study-sampling-input'), { target: { value: '150' } });
    expect(onChange).toHaveBeenCalledWith({ ...CONFIG, samplingRate: 1 });
  });

  it('updates the retention days value', () => {
    const onChange = vi.fn();
    render(<StudyConfigPanel {...defaultProps({ onChange })} />);
    fireEvent.change(screen.getByTestId('m5-study-retention-input'), { target: { value: '14' } });
    expect(onChange).toHaveBeenCalledWith({ ...CONFIG, retentionDays: 14 });
  });

  it('clamps the retention window to [1, 365] days', () => {
    const onChange = vi.fn();
    render(<StudyConfigPanel {...defaultProps({ onChange })} />);
    fireEvent.change(screen.getByTestId('m5-study-retention-input'), { target: { value: '0' } });
    expect(onChange).toHaveBeenCalledWith({ ...CONFIG, retentionDays: 1 });
  });

  it('changes the consent tier', () => {
    const onChange = vi.fn();
    render(<StudyConfigPanel {...defaultProps({ onChange })} />);
    fireEvent.change(screen.getByTestId('m5-study-consent-select'), { target: { value: 'anonymous' } });
    expect(onChange).toHaveBeenCalledWith({ ...CONFIG, consent: 'anonymous' });
  });

  it('adds a new redaction field', () => {
    const onChange = vi.fn();
    render(<StudyConfigPanel {...defaultProps({ onChange })} />);
    fireEvent.change(screen.getByTestId('m5-study-redaction-input'), { target: { value: 'phone' } });
    fireEvent.click(screen.getByTestId('m5-study-redaction-add'));
    expect(onChange).toHaveBeenCalledWith({ ...CONFIG, redactionFields: ['email', 'phone'] });
  });

  it('removes an existing redaction field', () => {
    const onChange = vi.fn();
    render(<StudyConfigPanel {...defaultProps({ onChange })} />);
    fireEvent.click(screen.getByTestId('m5-study-redaction-remove'));
    expect(onChange).toHaveBeenCalledWith({ ...CONFIG, redactionFields: [] });
  });

  it('adds a new A/B variant when asked', () => {
    const onChange = vi.fn();
    render(<StudyConfigPanel {...defaultProps({ onChange })} />);
    fireEvent.click(screen.getByTestId('m5-study-ab-add'));
    expect(onChange).toHaveBeenCalledWith({
      ...CONFIG,
      abVariants: [
        ...CONFIG.abVariants,
        { name: 'variant-3', weight: 0.5 },
      ],
    });
  });

  it('updates an A/B variant weight', () => {
    const onChange = vi.fn();
    render(<StudyConfigPanel {...defaultProps({ onChange })} />);
    fireEvent.change(screen.getAllByTestId('m5-study-ab-weight')[0]!, { target: { value: '0.25' } });
    expect(onChange).toHaveBeenCalledWith({
      ...CONFIG,
      abVariants: [
        { name: 'control', weight: 0.25 },
        { name: 'treatment', weight: 0.5 },
      ],
    });
  });

  it('removes an A/B variant', () => {
    const onChange = vi.fn();
    render(<StudyConfigPanel {...defaultProps({ onChange })} />);
    fireEvent.click(screen.getAllByTestId('m5-study-ab-remove')[0]!);
    expect(onChange).toHaveBeenCalledWith({
      ...CONFIG,
      abVariants: [{ name: 'treatment', weight: 0.5 }],
    });
  });

  it('toggles anonymous IPs', () => {
    const onChange = vi.fn();
    render(<StudyConfigPanel {...defaultProps({ onChange })} />);
    fireEvent.click(screen.getByTestId('m5-study-anonymous-ips-toggle'));
    expect(onChange).toHaveBeenCalledWith({ ...CONFIG, anonymousIps: false });
  });
});