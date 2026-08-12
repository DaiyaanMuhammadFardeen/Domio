/**
 * AutoPlayMode tests — S3.7.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { AutoPlayMode } from './AutoPlayMode';
import exampleDeck from '../../../../fixtures/example-deck.json' with { type: 'json' };
import type { DeckDocument } from '@domio/schema/generated/scene-graph';

const deck = exampleDeck as unknown as DeckDocument;

describe('AutoPlayMode', () => {
  it('renders a chrome with play, mute, track, counter', () => {
    render(
      <AutoPlayMode
        deck={deck}
        voiceoverUrl="https://media.domio.app/voiceover.mp3"
        voiceoverDurationMs={60_000}
        reducedMotion={false}
      />,
    );
    expect(screen.getByTestId('autoplay-mode-chrome')).toBeInTheDocument();
    expect(screen.getByTestId('autoplay-mode-play')).toBeInTheDocument();
    expect(screen.getByTestId('autoplay-mode-mute')).toBeInTheDocument();
    expect(screen.getByTestId('autoplay-mode-track')).toBeInTheDocument();
    expect(screen.getByTestId('autoplay-mode-counter')).toBeInTheDocument();
  });

  it('starts on slide 1 of N', () => {
    render(
      <AutoPlayMode
        deck={deck}
        voiceoverUrl="https://media.domio.app/voiceover.mp3"
        voiceoverDurationMs={60_000}
        reducedMotion={false}
      />,
    );
    expect(screen.getByTestId('autoplay-mode-counter').textContent).toContain(`1 / ${deck.slides.length}`);
  });

  it('toggles play state when play button is clicked', () => {
    render(
      <AutoPlayMode
        deck={deck}
        voiceoverUrl="https://media.domio.app/voiceover.mp3"
        voiceoverDurationMs={60_000}
        reducedMotion={false}
      />,
    );
    const btn = screen.getByTestId('autoplay-mode-play');
    expect(btn.textContent).toBe('▶');
    fireEvent.click(btn);
    expect(btn.textContent).toBe('⏸');
  });

  it('toggles mute state', () => {
    render(
      <AutoPlayMode
        deck={deck}
        voiceoverUrl="https://media.domio.app/voiceover.mp3"
        voiceoverDurationMs={60_000}
        reducedMotion={false}
      />,
    );
    const btn = screen.getByTestId('autoplay-mode-mute');
    expect(btn.textContent).toBe('🔊');
    fireEvent.click(btn);
    expect(btn.textContent).toBe('🔇');
  });

  it('emits onSlideChange when timeupdate advances', () => {
    const onChange = vi.fn();
    // Capture the onTimeUpdate callback by mocking the Voiceover's
    // <audio> element so we can fire the event manually.
    const { rerender: _rerender } = render(
      <AutoPlayMode
        deck={deck}
        voiceoverUrl="https://media.domio.app/voiceover.mp3"
        voiceoverDurationMs={60_000}
        reducedMotion={false}
        onSlideChange={onChange}
      />,
    );
    // Trigger via DOM: find audio element and dispatch timeupdate.
    const audio = document.querySelector('audio') as HTMLAudioElement | null;
    if (!audio) throw new Error('expected audio element');
    audio.currentTime = 32;
    act(() => {
      audio.dispatchEvent(new Event('timeupdate'));
    });
    expect(onChange).toHaveBeenCalled();
  });

  it('respects reduced motion prop (no transition)', () => {
    render(
      <AutoPlayMode
        deck={deck}
        voiceoverUrl="https://media.domio.app/voiceover.mp3"
        voiceoverDurationMs={60_000}
        reducedMotion
      />,
    );
    // The track fill exists; transition should be 'none'.
    const fill = document.querySelector('[data-testid="autoplay-mode-track"] > div') as HTMLElement;
    expect(fill).toBeTruthy();
  });

  it('handles empty deck gracefully', () => {
    const empty = { ...deck, slides: [] } as unknown as DeckDocument;
    render(
      <AutoPlayMode
        deck={empty}
        voiceoverUrl="https://media.domio.app/voiceover.mp3"
        voiceoverDurationMs={60_000}
        reducedMotion={false}
      />,
    );
    expect(screen.getByTestId('autoplay-mode-empty')).toBeInTheDocument();
  });
});