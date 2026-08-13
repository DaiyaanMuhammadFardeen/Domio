import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CopyAssistant } from './CopyAssistant';
import { LocaleProvider } from '../../lib/locale';

function renderPanel(text: string, onReplace: (s: string) => void = () => {}) {
  return render(
    <LocaleProvider locale="en">
      <CopyAssistant selectedText={text} onReplace={onReplace} />
    </LocaleProvider>,
  );
}

describe('CopyAssistant', () => {
  it('trigger is disabled when no text is selected', () => {
    renderPanel('');
    expect(screen.getByTestId('copy-assistant-trigger')).toBeDisabled();
  });

  it('opens the context-menu shell when triggered', () => {
    renderPanel('Hello world');
    fireEvent.click(screen.getByTestId('copy-assistant-trigger'));
    expect(screen.getByTestId('copy-assistant-menu')).toBeInTheDocument();
    expect(screen.getByTestId('copy-assistant-improve-btn')).toBeInTheDocument();
  });

  it('clicking Improve shows 4 tone variants (shorter, punchier, formal, casual)', async () => {
    renderPanel('We are pleased to announce the launch of our all-new product line.');
    fireEvent.click(screen.getByTestId('copy-assistant-trigger'));
    fireEvent.click(screen.getByTestId('copy-assistant-improve-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('copy-assistant-variants')).toBeInTheDocument();
    });

    expect(screen.getByTestId('copy-variant-shorter')).toBeInTheDocument();
    expect(screen.getByTestId('copy-variant-punchier')).toBeInTheDocument();
    expect(screen.getByTestId('copy-variant-formal')).toBeInTheDocument();
    expect(screen.getByTestId('copy-variant-casual')).toBeInTheDocument();
  });

  it('clicking a variant triggers onReplace with the variant text', async () => {
    const onReplace = vi.fn();
    renderPanel('We are pleased to announce the launch of our all-new product line.', onReplace);
    fireEvent.click(screen.getByTestId('copy-assistant-trigger'));
    fireEvent.click(screen.getByTestId('copy-assistant-improve-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('copy-variant-shorter')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('copy-variant-punchier'));
    expect(onReplace).toHaveBeenCalledTimes(1);
    expect(typeof onReplace.mock.calls[0]![0]).toBe('string');
    expect(onReplace.mock.calls[0]![0].length).toBeGreaterThan(0);
  });

  it('close button closes the menu', () => {
    renderPanel('Hello world');
    fireEvent.click(screen.getByTestId('copy-assistant-trigger'));
    expect(screen.getByTestId('copy-assistant-menu')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('copy-assistant-close'));
    expect(screen.queryByTestId('copy-assistant-menu')).not.toBeInTheDocument();
  });
});
