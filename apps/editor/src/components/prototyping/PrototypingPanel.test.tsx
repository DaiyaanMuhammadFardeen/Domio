/**
 * PrototypingPanel — Wave 2 §S2.12 unit tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PrototypingPanel } from './PrototypingPanel';

describe('PrototypingPanel', () => {
  it('renders the panel with tabs', () => {
    render(
      <PrototypingPanel
        onChangeGestures={vi.fn()}
        onChangeTrigger={vi.fn()}
        onChangeLogic={vi.fn()}
        onInsertFormInput={vi.fn()}
      />,
    );
    expect(screen.getByTestId('prototyping-panel')).toBeInTheDocument();
    expect(screen.getByTestId('prototyping-tab-triggers')).toBeInTheDocument();
    expect(screen.getByTestId('prototyping-tab-logic')).toBeInTheDocument();
    expect(screen.getByTestId('prototyping-tab-forms')).toBeInTheDocument();
  });

  it('shows the VoiceTriggerEditor on the triggers tab', () => {
    render(
      <PrototypingPanel
        onChangeGestures={vi.fn()}
        onChangeTrigger={vi.fn()}
        onChangeLogic={vi.fn()}
        onInsertFormInput={vi.fn()}
      />,
    );
    expect(screen.getByTestId('prototyping-voice-trigger')).toBeInTheDocument();
    expect(screen.getByTestId('prototyping-gesture-picker')).toBeInTheDocument();
  });

  it('switches to the logic tab', () => {
    render(
      <PrototypingPanel
        onChangeGestures={vi.fn()}
        onChangeTrigger={vi.fn()}
        onChangeLogic={vi.fn()}
        onInsertFormInput={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('prototyping-tab-logic'));
    expect(screen.getByTestId('prototyping-conditional')).toBeInTheDocument();
  });

  it('switches to the forms tab', () => {
    render(
      <PrototypingPanel
        onChangeGestures={vi.fn()}
        onChangeTrigger={vi.fn()}
        onChangeLogic={vi.fn()}
        onInsertFormInput={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('prototyping-tab-forms'));
    expect(screen.getByTestId('prototyping-form-palette')).toBeInTheDocument();
  });
});
