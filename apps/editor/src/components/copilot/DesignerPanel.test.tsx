import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DesignerPanel } from './DesignerPanel';
import { LocaleProvider } from '../../lib/locale';

function renderPanel(props: Partial<React.ComponentProps<typeof DesignerPanel>> = {}) {
  return render(
    <LocaleProvider locale="en">
      <DesignerPanel {...props} />
    </LocaleProvider>,
  );
}

describe('DesignerPanel', () => {
  it('renders with header and prompt input', () => {
    renderPanel();
    expect(screen.getByTestId('designer-panel')).toBeInTheDocument();
    expect(screen.getByTestId('designer-prompt-input')).toBeInTheDocument();
    expect(screen.getByTestId('designer-generate-btn')).toBeInTheDocument();
  });

  it('generate button is disabled when prompt is empty', () => {
    renderPanel();
    expect(screen.getByTestId('designer-generate-btn')).toBeDisabled();
  });

  it('typing a prompt enables the generate button', () => {
    renderPanel();
    fireEvent.change(screen.getByTestId('designer-prompt-input'), {
      target: { value: 'A playful pricing comparison' },
    });
    expect(screen.getByTestId('designer-generate-btn')).not.toBeDisabled();
  });

  it('clicking generate renders 4 layout previews', async () => {
    renderPanel();
    fireEvent.change(screen.getByTestId('designer-prompt-input'), {
      target: { value: 'Comparison of pricing tiers' },
    });
    fireEvent.click(screen.getByTestId('designer-generate-btn'));

    await waitFor(() => {
      const previews = screen.getAllByTestId('layout-preview');
      expect(previews).toHaveLength(4);
    });
  });

  it('clicking apply on a layout fires the onApplyLayout callback and marks the card', async () => {
    const onApplyLayout = vi.fn();
    renderPanel({ onApplyLayout });
    fireEvent.change(screen.getByTestId('designer-prompt-input'), {
      target: { value: 'Comparison of pricing tiers' },
    });
    fireEvent.click(screen.getByTestId('designer-generate-btn'));

    await waitFor(() => {
      expect(screen.getAllByTestId('layout-preview')).toHaveLength(4);
    });

    const firstPreview = screen.getAllByTestId('layout-preview')[0]!;
    fireEvent.click(firstPreview);

    expect(onApplyLayout).toHaveBeenCalledTimes(1);
    const passedLayout = onApplyLayout.mock.calls[0]![0];
    expect(passedLayout).toHaveProperty('id');
    expect(passedLayout).toHaveProperty('kind');

    // After applying, the applied-confirm chip is rendered.
    expect(await screen.findByTestId('designer-applied-confirm')).toBeInTheDocument();
  });

  it('Cmd/Ctrl+Enter in the prompt area triggers generate', async () => {
    renderPanel();
    const input = screen.getByTestId('designer-prompt-input');
    fireEvent.change(input, { target: { value: 'Strategy deck' } });
    fireEvent.keyDown(input, { key: 'Enter', metaKey: true });

    await waitFor(() => {
      expect(screen.getAllByTestId('layout-preview')).toHaveLength(4);
    });
  });
});