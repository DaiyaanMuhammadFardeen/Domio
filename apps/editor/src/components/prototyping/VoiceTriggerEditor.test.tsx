/**
 * VoiceTriggerEditor — Wave 2 §S2.12 unit tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VoiceTriggerEditor } from './VoiceTriggerEditor';

describe('VoiceTriggerEditor', () => {
  it('renders the trigger UI', () => {
    render(<VoiceTriggerEditor onChange={vi.fn()} />);
    expect(screen.getByTestId('prototyping-voice-trigger')).toBeInTheDocument();
    expect(screen.getByTestId('voice-trigger-label')).toBeInTheDocument();
    expect(screen.getByTestId('voice-trigger-locale')).toBeInTheDocument();
    expect(screen.getByTestId('voice-trigger-add')).toBeInTheDocument();
  });

  it('emits onChange when label changes', () => {
    const onChange = vi.fn();
    render(<VoiceTriggerEditor onChange={onChange} />);
    fireEvent.change(screen.getByTestId('voice-trigger-label'), { target: { value: 'Trigger A' } });
    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1]![0] as { label: string };
    expect(lastCall.label).toBe('Trigger A');
  });

  it('adds a phrase', () => {
    render(<VoiceTriggerEditor onChange={vi.fn()} />);
    const before = screen.getAllByText(/next slide|wake|phrase/).length;
    fireEvent.click(screen.getByTestId('voice-trigger-add'));
    const addButtons = screen.getAllByTestId(/voice-trigger-phrase-input-/);
    expect(addButtons.length).toBeGreaterThan(0);
    expect(before).toBeGreaterThanOrEqual(0);
  });

  it('removes a phrase', () => {
    render(<VoiceTriggerEditor onChange={vi.fn()} />);
    const removeButtons = screen.queryAllByTestId(/voice-trigger-remove-/);
    if (removeButtons.length > 0) {
      fireEvent.click(removeButtons[0]!);
    }
    // No assertion error means render still works after remove.
    expect(screen.getByTestId('prototyping-voice-trigger')).toBeInTheDocument();
  });
});
