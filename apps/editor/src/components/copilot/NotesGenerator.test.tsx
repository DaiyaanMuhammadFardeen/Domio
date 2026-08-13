import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NotesGenerator } from './NotesGenerator';
import type { NotesResponse } from '../../lib/ai-service';

const mockResponse: NotesResponse = {
  slideId: 'slide-1',
  style: 'bullets',
  notes: '— Highlight the headline\n— Walk through the chart\n— Close with the call to action',
  citationIds: ['cite-a', 'cite-b'],
};

const generateNotesFn = vi.fn().mockResolvedValue(mockResponse);
const onInsertNotes = vi.fn();

beforeEach(() => {
  generateNotesFn.mockClear();
  onInsertNotes.mockClear();
});

function renderGenerator(overrides: Partial<Parameters<typeof NotesGenerator>[0]> = {}) {
  return render(
    <NotesGenerator
      slideId="slide-1"
      generateNotesFn={generateNotesFn}
      onInsertNotes={onInsertNotes}
      {...overrides}
    />,
  );
}

describe('NotesGenerator (Wave 6 S6.6)', () => {
  it('renders the three style presets', () => {
    renderGenerator();
    expect(screen.getByTestId('notes-generator-style-bullets')).toBeInTheDocument();
    expect(screen.getByTestId('notes-generator-style-paragraph')).toBeInTheDocument();
    expect(screen.getByTestId('notes-generator-style-story')).toBeInTheDocument();
  });

  it('bullets is the default style', () => {
    renderGenerator();
    const bullets = screen.getByTestId('notes-generator-style-bullets');
    expect(bullets.getAttribute('aria-checked')).toBe('true');
  });

  it('clicking a different style updates the selection', () => {
    renderGenerator();
    const story = screen.getByTestId('notes-generator-style-story');
    fireEvent.click(story);
    expect(story.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('notes-generator-style-bullets').getAttribute('aria-checked')).toBe(
      'false',
    );
  });

  it('clicking Generate calls generateNotesFn with the slide id and style', async () => {
    renderGenerator();
    fireEvent.click(screen.getByTestId('notes-generator-generate'));

    await waitFor(() => {
      expect(generateNotesFn).toHaveBeenCalledTimes(1);
    });

    expect(generateNotesFn).toHaveBeenCalledWith('slide-1', {
      style: 'bullets',
      feedback: '',
      previousNotes: '',
    });
  });

  it('renders the generated notes preview', async () => {
    renderGenerator();
    fireEvent.click(screen.getByTestId('notes-generator-generate'));

    await waitFor(() => {
      expect(screen.getByTestId('notes-generator-preview')).toHaveTextContent('Highlight the headline');
    });
  });

  it('clicking "Insert into slide" calls onInsertNotes with the generated text', async () => {
    renderGenerator();
    fireEvent.click(screen.getByTestId('notes-generator-generate'));

    await waitFor(() => screen.getByTestId('notes-generator-insert'));
    fireEvent.click(screen.getByTestId('notes-generator-insert'));

    expect(onInsertNotes).toHaveBeenCalledWith(mockResponse.notes);
  });

  it('regenerate passes the previous notes and current feedback', async () => {
    renderGenerator();
    fireEvent.click(screen.getByTestId('notes-generator-generate'));

    await waitFor(() => screen.getByTestId('notes-generator-regenerate'));

    // Update feedback, then regenerate via the secondary button.
    fireEvent.change(screen.getByTestId('notes-generator-feedback'), {
      target: { value: 'More concise' },
    });
    fireEvent.click(screen.getByTestId('notes-generator-regenerate'));

    await waitFor(() => {
      expect(generateNotesFn).toHaveBeenCalledTimes(2);
    });

    const secondCall = generateNotesFn.mock.calls[1];
    expect(secondCall).toBeDefined();
    expect(secondCall![0]).toBe('slide-1');
    expect((secondCall![1] as { style: string; feedback: string; previousNotes: string }).feedback).toBe('More concise');
    expect((secondCall![1] as { previousNotes: string }).previousNotes).toBe(mockResponse.notes);
  });

  it('error from generateNotesFn is surfaced', async () => {
    generateNotesFn.mockRejectedValueOnce(new Error('network down'));
    renderGenerator();
    fireEvent.click(screen.getByTestId('notes-generator-generate'));

    await waitFor(() => {
      expect(screen.getByTestId('notes-generator-error')).toHaveTextContent('network down');
    });
  });

  it('changing the slide id resets the prior result', async () => {
    const { rerender } = renderGenerator();
    fireEvent.click(screen.getByTestId('notes-generator-generate'));

    await waitFor(() => screen.getByTestId('notes-generator-preview'));
    expect(screen.getByTestId('notes-generator-preview')).toBeInTheDocument();

    rerender(
      <NotesGenerator
        slideId="slide-2"
        generateNotesFn={generateNotesFn}
        onInsertNotes={onInsertNotes}
      />,
    );

    expect(screen.queryByTestId('notes-generator-preview')).toBeNull();
  });

  it('disabled state prevents interaction', () => {
    renderGenerator({ disabled: true });
    const generateBtn = screen.getByTestId('notes-generator-generate') as HTMLButtonElement;
    expect(generateBtn.disabled).toBe(true);
  });

  it('clicking Generate when no slide selected is a no-op (no crash)', () => {
    // Render with empty slideId, the component still renders — but
    // the click should call generateNotesFn with an empty id.
    renderGenerator({ slideId: '' });
    fireEvent.click(screen.getByTestId('notes-generator-generate'));
    expect(generateNotesFn).toHaveBeenCalledWith('', {
      style: 'bullets',
      feedback: '',
      previousNotes: '',
    });
  });
});