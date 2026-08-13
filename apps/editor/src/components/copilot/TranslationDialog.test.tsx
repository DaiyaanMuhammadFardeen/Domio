import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TranslationDialog, type GlossaryEntry } from './TranslationDialog';
import { LocaleProvider } from '../../lib/locale';

const GLOSSARY: readonly GlossaryEntry[] = [
  { source: 'Domio', target: 'دوميو' },
  { source: 'copilot', target: 'مساعد ذكي' },
];

function renderDialog(
  selectedText = 'Hello world',
  props: Partial<React.ComponentProps<typeof TranslationDialog>> = {},
) {
  return render(
    <LocaleProvider locale="en">
      <TranslationDialog open={true} selectedText={selectedText} {...props} />
    </LocaleProvider>,
  );
}

describe('TranslationDialog', () => {
  it('renders when open=true', () => {
    renderDialog();
    expect(screen.getByTestId('translation-dialog')).toBeInTheDocument();
  });

  it('does not render content when open=false (closed sentinel)', () => {
    render(
      <LocaleProvider locale="en">
        <TranslationDialog open={false} selectedText="ignored" />
      </LocaleProvider>,
    );
    expect(screen.queryByTestId('translation-dialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('translation-dialog-closed')).toBeInTheDocument();
  });

  it('target select lists 8 language options', () => {
    renderDialog();
    const select = screen.getByTestId('translation-target-select') as HTMLSelectElement;
    const opts = Array.from(select.options).map((o) => o.value);
    expect(opts).toEqual(['en', 'es', 'fr', 'de', 'ja', 'zh-CN', 'ar', 'ur']);
  });

  it('picking ar (RTL) sets dir="rtl" on the preview', async () => {
    renderDialog('Some text to translate');
    const select = screen.getByTestId('translation-target-select');
    fireEvent.change(select, { target: { value: 'ar' } });

    fireEvent.click(screen.getByTestId('translation-translate-btn'));

    const preview = await screen.findByTestId('translation-preview');
    expect(preview).toHaveAttribute('dir', 'rtl');
    expect(preview).toHaveAttribute('data-rtl', 'true');

    const rtlHint = screen.getByTestId('translation-rtl-hint');
    expect(rtlHint).toBeInTheDocument();
  });

  it('picking ur (RTL) also applies dir="rtl"', async () => {
    renderDialog('Hello there');
    fireEvent.change(screen.getByTestId('translation-target-select'), { target: { value: 'ur' } });
    fireEvent.click(screen.getByTestId('translation-translate-btn'));

    const preview = await screen.findByTestId('translation-preview');
    expect(preview).toHaveAttribute('dir', 'rtl');
  });

  it('picking en (LTR) keeps dir="ltr"', async () => {
    renderDialog('Hello there');
    fireEvent.change(screen.getByTestId('translation-target-select'), { target: { value: 'en' } });
    fireEvent.click(screen.getByTestId('translation-translate-btn'));

    const preview = await screen.findByTestId('translation-preview');
    expect(preview).toHaveAttribute('dir', 'ltr');
  });

  it('glossary summary renders when glossary entries are provided', () => {
    renderDialog('Domio is your copilot.', { glossary: GLOSSARY });
    expect(screen.getByTestId('translation-glossary')).toBeInTheDocument();
    expect(screen.getByText('Domio')).toBeInTheDocument();
  });

  it('translate button triggers a translation and apply fires onApply', async () => {
    const onApply = vi.fn();
    renderDialog('Domio is your copilot.', { glossary: GLOSSARY, onApply });
    fireEvent.click(screen.getByTestId('translation-translate-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('translation-preview').textContent).not.toBe('');
    });

    fireEvent.click(screen.getByTestId('translation-apply-btn'));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(typeof onApply.mock.calls[0]![0]).toBe('string');
  });

  it('cancel button calls onClose', () => {
    const onClose = vi.fn();
    renderDialog('Hi', { onClose });
    fireEvent.click(screen.getByTestId('translation-cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});