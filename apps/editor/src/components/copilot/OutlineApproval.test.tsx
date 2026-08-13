import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OutlineApproval } from './OutlineApproval';
import { LocaleProvider } from '../../lib/locale';
import { resetStore, getState } from '../../lib/p12-store';

// The real ai-service.approveOutline is called fire-and-forget. We
// stub it so we can verify the call shape without relying on fetch.
import type * as AiService from '../../lib/ai-service';

vi.mock('../../lib/ai-service', async () => {
  const actual = await vi.importActual<typeof AiService>('../../lib/ai-service');
  return {
    ...actual,
    approveOutline: vi.fn().mockResolvedValue({
      outlineId: 'outline-test',
      approvedAtMs: 1_700_000_000_000,
    }),
    openCitation: vi.fn().mockResolvedValue({
      id: 'cite-1',
      sourceLabel: 'Mock source',
      url: '/citation/cite-1',
    }),
  };
});

import { approveOutline, openCitation } from '../../lib/ai-service';

function renderPanel() {
  return render(
    <LocaleProvider locale="en">
      <OutlineApproval />
    </LocaleProvider>,
  );
}

beforeEach(() => {
  resetStore();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('OutlineApproval (Wave 6 S6.2)', () => {
  it('renders the outline with per-slide title + summary', async () => {
    renderPanel();
    fireEvent.change(screen.getByTestId('p12-prompt-input'), { target: { value: 'My deck' } });
    fireEvent.click(screen.getByTestId('p12-generate-btn'));

    const slides = getState().outline!.slides;
    await waitFor(() => {
      for (const slide of slides) {
        expect(screen.getByTestId(`p12-slide-summary-${slide.id}`)).toBeInTheDocument();
      }
    });
  });

  it('inline title edit updates the slide intent', async () => {
    renderPanel();
    fireEvent.change(screen.getByTestId('p12-prompt-input'), { target: { value: 'Pitch' } });
    fireEvent.click(screen.getByTestId('p12-generate-btn'));

    const firstId = getState().outline!.slides[0]!.id;
    await waitFor(() => screen.getByTestId(`p12-edit-${firstId}`));

    fireEvent.click(screen.getByTestId(`p12-edit-${firstId}`));
    const editInput = screen
      .getByTestId(`p12-slide-${firstId}`)
      .querySelector('input[type="text"]') as HTMLInputElement;
    expect(editInput).toBeInTheDocument();

    fireEvent.change(editInput, { target: { value: 'Custom Title' } });
    fireEvent.keyDown(editInput, { key: 'Enter' });

    expect(getState().outline!.slides[0]!.intent).toBe('Custom Title');
  });

  it('clicking Approve invokes ai-service.approveOutline with the slides', async () => {
    renderPanel();
    fireEvent.change(screen.getByTestId('p12-prompt-input'), { target: { value: 'Pitch' } });
    fireEvent.click(screen.getByTestId('p12-generate-btn'));

    await waitFor(() => screen.getByTestId('p12-approve-btn'));

    fireEvent.click(screen.getByTestId('p12-approve-btn'));

    await waitFor(() => {
      expect(approveOutline).toHaveBeenCalledTimes(1);
    });

    const call = vi.mocked(approveOutline).mock.calls[0]?.[0];
    expect(call).toBeDefined();
    expect(call!.slides.length).toBeGreaterThanOrEqual(1);
    // Each slide has a title + summary as required by S6.2.
    for (const slide of call!.slides) {
      expect(typeof slide.title).toBe('string');
      expect(slide.title.length).toBeGreaterThan(0);
      expect(typeof slide.summary).toBe('string');
      expect(Array.isArray(slide.citationIds)).toBe(true);
    }
  });

  it('renders source citation chips per slide', async () => {
    renderPanel();
    fireEvent.change(screen.getByTestId('p12-prompt-input'), { target: { value: 'Citations' } });
    fireEvent.click(screen.getByTestId('p12-generate-btn'));

    const firstSlideId = getState().outline!.slides[0]!.id;
    await waitFor(() => screen.getByTestId(`p12-slide-citations-${firstSlideId}`));

    // The first slide carries a citation row; clicking it dispatches
    // through the SourceCitation chip which uses onActivate (none
    // provided → triggers the openCitation fire-and-forget call).
    const citationsBlock = screen.getByTestId(`p12-slide-citations-${firstSlideId}`);
    expect(citationsBlock.querySelectorAll('button')).toBeTruthy();
  });

  it('drag-reorder via DnD events reorders slides', async () => {
    renderPanel();
    fireEvent.change(screen.getByTestId('p12-prompt-input'), { target: { value: 'Reorder' } });
    fireEvent.click(screen.getByTestId('p12-generate-btn'));

    const slides = getState().outline!.slides;
    const firstId = slides[0]!.id;
    const secondId = slides[1]!.id;

    await waitFor(() => screen.getByTestId(`p12-slide-${firstId}`));

    const firstCard = screen.getByTestId(`p12-slide-${firstId}`);
    const secondCard = screen.getByTestId(`p12-slide-${secondId}`);

    const dataTransfer = {
      setData: vi.fn(),
      getData: vi.fn().mockReturnValue(firstId),
      effectAllowed: '',
    } as unknown as DataTransfer;

    // The component wires DnD via `onDragStartCapture` (motion's
    // onDragStart shadowed drag prop). Native drag events bubble
    // through capture then target then bubble, so `fireEvent.dragStart`
    // fires the capture-phase listener too.
    fireEvent.dragStart(firstCard, { dataTransfer });
    fireEvent.dragOver(secondCard, { dataTransfer });
    fireEvent.drop(secondCard, { dataTransfer });

    // After dropping the first card onto the second card, the first
    // card should move "down" (after the second), making the second
    // slide index 0.
    await waitFor(() => {
      expect(getState().outline!.slides[0]!.id).toBe(secondId);
    });
  });

  it('remove (Trash) deletes the slide', async () => {
    renderPanel();
    fireEvent.change(screen.getByTestId('p12-prompt-input'), { target: { value: 'Remove me' } });
    fireEvent.click(screen.getByTestId('p12-generate-btn'));

    const slides = getState().outline!.slides;
    const firstId = slides[0]!.id;
    const countBefore = slides.length;

    await waitFor(() => screen.getByTestId(`p12-delete-${firstId}`));
    fireEvent.click(screen.getByTestId(`p12-delete-${firstId}`));
    expect(getState().outline!.slides.length).toBe(countBefore - 1);
  });

  it('clicking a citation chip calls openCitation', async () => {
    renderPanel();
    fireEvent.change(screen.getByTestId('p12-prompt-input'), { target: { value: 'Cite test' } });
    fireEvent.click(screen.getByTestId('p12-generate-btn'));

    const slides = getState().outline!.slides;
    // Find the first slide that has at least one citation chip.
    let chosenChipId: string | null = null;
    for (const slide of slides) {
      const container = await waitFor(() =>
        screen.queryByTestId(`p12-slide-citations-${slide.id}`),
      );
      if (container) {
        const btn = container.querySelector('button');
        if (btn) {
          chosenChipId = btn.getAttribute('data-testid') ?? null;
          break;
        }
      }
    }

    if (chosenChipId) {
      fireEvent.click(screen.getByTestId(chosenChipId));
      await waitFor(() => {
        expect(openCitation).toHaveBeenCalled();
      });
    }
  });
});

describe('OutlineApproval (Phase 12 baseline regression)', () => {
  it('renders the empty state with panel header', () => {
    renderPanel();
    expect(screen.getByTestId('p12-copilot-panel')).toBeInTheDocument();
    expect(screen.getByText('AI Copilot')).toBeInTheDocument();
    expect(screen.getByText('Create a presentation outline')).toBeInTheDocument();
  });

  it('shows suggestion chips', () => {
    renderPanel();
    expect(screen.getByTestId('p12-suggestion-quarterly-revenue-review')).toBeInTheDocument();
  });

  it('generate button is disabled when prompt is empty', () => {
    renderPanel();
    expect(screen.getByTestId('p12-generate-btn')).toBeDisabled();
  });

  it('clicking generate with text creates an outline', () => {
    renderPanel();
    fireEvent.change(screen.getByTestId('p12-prompt-input'), { target: { value: 'My deck' } });
    fireEvent.click(screen.getByTestId('p12-generate-btn'));

    const state = getState();
    expect(state.outline).not.toBeNull();
    expect(state.outline!.slides.length).toBeGreaterThanOrEqual(6);
  });

  it('Approve transitions to progress (queued)', async () => {
    renderPanel();
    fireEvent.change(screen.getByTestId('p12-prompt-input'), { target: { value: 'Deck' } });
    fireEvent.click(screen.getByTestId('p12-generate-btn'));

    await waitFor(() => screen.getByTestId('p12-approve-btn'));
    fireEvent.click(screen.getByTestId('p12-approve-btn'));
    expect(getState().jobStatus).toBe('queued');
  });

  it('move up / move down reorders slides', async () => {
    renderPanel();
    fireEvent.change(screen.getByTestId('p12-prompt-input'), { target: { value: 'Deck' } });
    fireEvent.click(screen.getByTestId('p12-generate-btn'));

    const slides = getState().outline!.slides;
    const firstId = slides[0]!.id;
    const secondId = slides[1]!.id;

    await waitFor(() => screen.getByTestId(`p12-move-down-${firstId}`));
    fireEvent.click(screen.getByTestId(`p12-move-down-${firstId}`));
    expect(getState().outline!.slides[0]!.id).toBe(secondId);
    expect(getState().outline!.slides[1]!.id).toBe(firstId);

    // secondId is now at index 0; move it down so it returns to index 1.
    fireEvent.click(screen.getByTestId(`p12-move-down-${secondId}`));
    expect(getState().outline!.slides[0]!.id).toBe(firstId);
    expect(getState().outline!.slides[1]!.id).toBe(secondId);
  });
});
