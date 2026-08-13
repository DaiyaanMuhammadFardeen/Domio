import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RedesignPanel, type SelectedSlide } from './RedesignPanel';
import { LocaleProvider } from '../../lib/locale';

const SELECTED: SelectedSlide = {
  id: 'slide-42',
  title: 'Quarterly Revenue',
  blocks: ['Strong Q3 growth', 'APAC outperformed', 'New SKU: Pro+'],
};

function renderPanel(props: Partial<React.ComponentProps<typeof RedesignPanel>> = {}) {
  return render(
    <LocaleProvider locale="en">
      <RedesignPanel selectedSlide={SELECTED} {...props} />
    </LocaleProvider>,
  );
}

describe('RedesignPanel', () => {
  it('shows the selected slide summary', () => {
    renderPanel();
    expect(screen.getByTestId('redesign-selected-slide')).toBeInTheDocument();
    expect(screen.getByText('Quarterly Revenue')).toBeInTheDocument();
  });

  it('shows an empty hint when no slide is selected', () => {
    renderPanel({ selectedSlide: null });
    expect(screen.getByTestId('redesign-empty')).toBeInTheDocument();
  });

  it('mode radio group defaults to light', () => {
    renderPanel();
    const light = screen.getByTestId('redesign-mode-light');
    const full = screen.getByTestId('redesign-mode-full');
    expect(light).toHaveAttribute('aria-checked', 'true');
    expect(full).toHaveAttribute('aria-checked', 'false');
  });

  it('clicking mode toggles between light and full', () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('redesign-mode-full'));
    expect(screen.getByTestId('redesign-mode-full')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('redesign-mode-light')).toHaveAttribute('aria-checked', 'false');
  });

  it('clicking Redesign triggers the redesign flow and renders a preview', async () => {
    const onApplyRedesign = vi.fn();
    renderPanel({ onApplyRedesign });

    fireEvent.click(screen.getByTestId('redesign-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('redesign-result')).toBeInTheDocument();
    });
    expect(screen.getByTestId('redesign-brand-locked')).toBeInTheDocument();
    expect(screen.getByTestId('layout-preview')).toBeInTheDocument();
  });

  it('clicking the preview fires onApplyRedesign and confirms the replace', async () => {
    const onApplyRedesign = vi.fn();
    renderPanel({ onApplyRedesign });

    fireEvent.click(screen.getByTestId('redesign-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('redesign-result')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('layout-preview'));
    expect(onApplyRedesign).toHaveBeenCalledTimes(1);
    const result = onApplyRedesign.mock.calls[0]![0];
    expect(result).toHaveProperty('originalSlideId', 'slide-42');
    expect(result).toHaveProperty('brandLocked', true);
    expect(result).toHaveProperty('redesign');

    expect(await screen.findByTestId('redesign-applied-confirm')).toBeInTheDocument();
  });

  it('clicking Redesign without a selected slide is a no-op (button disabled)', () => {
    renderPanel({ selectedSlide: null });
    expect(screen.getByTestId('redesign-btn')).toBeDisabled();
  });
});
