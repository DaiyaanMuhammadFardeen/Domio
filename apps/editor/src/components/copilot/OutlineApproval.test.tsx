import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OutlineApproval } from './OutlineApproval';
import { LocaleProvider } from '../../lib/locale';
import { resetStore, getState } from '../../lib/p12-store';

function renderPanel() {
  return render(
    <LocaleProvider locale="en">
      <OutlineApproval />
    </LocaleProvider>,
  );
}

beforeEach(() => {
  resetStore();
});

describe('OutlineApproval', () => {
  it('renders the empty state with panel header', () => {
    renderPanel();
    expect(screen.getByTestId('p12-copilot-panel')).toBeInTheDocument();
    expect(screen.getByText('AI Copilot')).toBeInTheDocument();
    expect(screen.getByText('Create a presentation outline')).toBeInTheDocument();
  });

  it('shows suggestion chips', () => {
    renderPanel();
    expect(screen.getByTestId('p12-suggestion-quarterly-revenue-review')).toBeInTheDocument();
    expect(screen.getByTestId('p12-suggestion-product-launch-plan')).toBeInTheDocument();
    expect(screen.getByTestId('p12-suggestion-competitive-landscape')).toBeInTheDocument();
    expect(screen.getByTestId('p12-suggestion-team-onboarding-deck')).toBeInTheDocument();
    expect(screen.getByTestId('p12-suggestion-annual-strategy-update')).toBeInTheDocument();
  });

  it('populate prompt input when clicking a suggestion chip', () => {
    renderPanel();
    const chip = screen.getByTestId('p12-suggestion-quarterly-revenue-review');
    fireEvent.click(chip);
    const input = screen.getByTestId('p12-prompt-input') as HTMLInputElement;
    expect(input.value).toBe('Quarterly revenue review');
  });

  it('generate button is disabled when prompt is empty', () => {
    renderPanel();
    expect(screen.getByTestId('p12-generate-btn')).toBeDisabled();
  });

  it('generate button is enabled when prompt has text', () => {
    renderPanel();
    fireEvent.change(screen.getByTestId('p12-prompt-input'), { target: { value: 'My deck' } });
    expect(screen.getByTestId('p12-generate-btn')).not.toBeDisabled();
  });

  it('clicking generate with text creates an outline', () => {
    renderPanel();
    fireEvent.change(screen.getByTestId('p12-prompt-input'), { target: { value: 'My deck' } });
    fireEvent.click(screen.getByTestId('p12-generate-btn'));

    const state = getState();
    expect(state.outline).not.toBeNull();
    expect(state.outline!.slides.length).toBeGreaterThanOrEqual(6);
  });

  it('pressing Enter in prompt triggers generate', () => {
    renderPanel();
    fireEvent.change(screen.getByTestId('p12-prompt-input'), { target: { value: 'My deck' } });
    fireEvent.keyDown(screen.getByTestId('p12-prompt-input'), { key: 'Enter' });

    expect(getState().outline).not.toBeNull();
  });

  it('shows outline list after generation', async () => {
    renderPanel();
    fireEvent.change(screen.getByTestId('p12-prompt-input'), { target: { value: 'Revenue review' } });
    fireEvent.click(screen.getByTestId('p12-generate-btn'));

    const slides = getState().outline!.slides;
    await waitFor(() => {
      for (const slide of slides) {
        expect(screen.getByTestId(`p12-slide-${slide.id}`)).toBeInTheDocument();
      }
    });
  });

  it('shows footer with slide count and approve button', async () => {
    renderPanel();
    fireEvent.change(screen.getByTestId('p12-prompt-input'), { target: { value: 'Deck' } });
    fireEvent.click(screen.getByTestId('p12-generate-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('p12-approve-btn')).toBeInTheDocument();
    });
    expect(screen.getByText(`${getState().outline!.slides.length} slides`)).toBeInTheDocument();
  });

  it('delete button removes a slide from the list', async () => {
    renderPanel();
    fireEvent.change(screen.getByTestId('p12-prompt-input'), { target: { value: 'Deck' } });
    fireEvent.click(screen.getByTestId('p12-generate-btn'));

    const slides = getState().outline!.slides;
    const firstId = slides[0]!.id;
    const countBefore = slides.length;

    await waitFor(() => {
      expect(screen.getByTestId(`p12-delete-${firstId}`)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId(`p12-delete-${firstId}`));
    expect(getState().outline!.slides.length).toBe(countBefore - 1);
  });

  it('move down reorders slides', async () => {
    renderPanel();
    fireEvent.change(screen.getByTestId('p12-prompt-input'), { target: { value: 'Deck' } });
    fireEvent.click(screen.getByTestId('p12-generate-btn'));

    const slides = getState().outline!.slides;
    const firstId = slides[0]!.id;
    const secondId = slides[1]!.id;

    await waitFor(() => {
      expect(screen.getByTestId(`p12-move-down-${firstId}`)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId(`p12-move-down-${firstId}`));
    expect(getState().outline!.slides[0]!.id).toBe(secondId);
    expect(getState().outline!.slides[1]!.id).toBe(firstId);
  });

  it('move up reorders slides', async () => {
    renderPanel();
    fireEvent.change(screen.getByTestId('p12-prompt-input'), { target: { value: 'Deck' } });
    fireEvent.click(screen.getByTestId('p12-generate-btn'));

    const slides = getState().outline!.slides;
    const firstId = slides[0]!.id;
    const secondId = slides[1]!.id;

    await waitFor(() => {
      expect(screen.getByTestId(`p12-move-up-${secondId}`)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId(`p12-move-up-${secondId}`));
    expect(getState().outline!.slides[0]!.id).toBe(secondId);
    expect(getState().outline!.slides[1]!.id).toBe(firstId);
  });

  it('edit button enables inline editing', async () => {
    renderPanel();
    fireEvent.change(screen.getByTestId('p12-prompt-input'), { target: { value: 'Deck' } });
    fireEvent.click(screen.getByTestId('p12-generate-btn'));

    const slides = getState().outline!.slides;
    const firstId = slides[0]!.id;

    await waitFor(() => {
      expect(screen.getByTestId(`p12-edit-${firstId}`)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId(`p12-edit-${firstId}`));
    const editInput = screen.getByTestId(`p12-slide-${firstId}`).querySelector('input[type="text"]');
    expect(editInput).toBeInTheDocument();
  });

  it('Approve & Generate transitions to progress state', async () => {
    renderPanel();
    fireEvent.change(screen.getByTestId('p12-prompt-input'), { target: { value: 'Deck' } });
    fireEvent.click(screen.getByTestId('p12-generate-btn'));

    // Wait for outline phase to render
    await waitFor(() => {
      expect(screen.getByTestId('p12-approve-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('p12-approve-btn'));
    expect(getState().jobStatus).toBe('queued');
  }, 10000);

  it('approve and generate transitions through statuses with real timers', async () => {
    renderPanel();
    fireEvent.change(screen.getByTestId('p12-prompt-input'), { target: { value: 'Deck' } });
    fireEvent.click(screen.getByTestId('p12-generate-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('p12-approve-btn')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('p12-approve-btn'));

    expect(getState().jobStatus).toBe('queued');

    // Wait for running
    await waitFor(() => {
      expect(getState().jobStatus).toBe('running');
    }, { timeout: 3000 });

    // Wait for succeeded
    await waitFor(() => {
      expect(getState().jobStatus).toBe('succeeded');
    }, { timeout: 5000 });

    expect(getState().completedCount).toBe(getState().generatedSlides.length);
  }, 10000);

  it('chart type selector appears only for slides with dataBinding', async () => {
    renderPanel();
    fireEvent.change(screen.getByTestId('p12-prompt-input'), { target: { value: 'Deck' } });
    fireEvent.click(screen.getByTestId('p12-generate-btn'));

    // Wait for outline phase to render
    await waitFor(() => {
      expect(screen.getByTestId('p12-approve-btn')).toBeInTheDocument();
    });

    const slides = getState().outline!.slides;
    const withBinding = slides.find((s) => s.dataBinding !== null);
    const withoutBinding = slides.find((s) => s.dataBinding === null);

    if (withBinding) {
      const el = screen.getByTestId(`p12-slide-${withBinding.id}`);
      expect(el.querySelector('[role="radiogroup"]')).toBeInTheDocument();
    }
    if (withoutBinding) {
      const el = screen.getByTestId(`p12-slide-${withoutBinding.id}`);
      expect(el.querySelector('[role="radiogroup"]')).toBeNull();
    }
  }, 10000);

  it('keyboard: Enter on prompt triggers generate', () => {
    renderPanel();
    const input = screen.getByTestId('p12-prompt-input');
    fireEvent.change(input, { target: { value: 'Strategy deck' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(getState().outline).not.toBeNull();
  });
});
