import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getState,
  subscribe,
  createOutlineFromPrompt,
  reorderSlide,
  editSlideTitle,
  deleteSlide,
  setChartType,
  approveAndGenerate,
  resetStore,
} from './p12-store';

beforeEach(() => {
  resetStore();
});

describe('p12-store', () => {
  it('starts with idle status and no outline', () => {
    const state = getState();
    expect(state.outline).toBeNull();
    expect(state.jobStatus).toBe('idle');
    expect(state.generatedSlides).toEqual([]);
    expect(state.completedCount).toBe(0);
  });

  it('creates an outline from a prompt', () => {
    createOutlineFromPrompt('Quarterly revenue review');
    const state = getState();
    expect(state.outline).not.toBeNull();
    expect(state.outline!.slides.length).toBeGreaterThanOrEqual(6);
    expect(state.outline!.slides.length).toBeLessThanOrEqual(8);
    expect(state.jobStatus).toBe('idle');
  });

  it('reorders slides up and down', () => {
    createOutlineFromPrompt('test');
    const slides = getState().outline!.slides;
    const firstId = slides[0]!.id;
    const secondId = slides[1]!.id;

    reorderSlide(firstId, 'down');
    const afterDown = getState().outline!.slides;
    expect(afterDown[0]!.id).toBe(secondId);
    expect(afterDown[1]!.id).toBe(firstId);

    reorderSlide(firstId, 'up');
    const afterUp = getState().outline!.slides;
    expect(afterUp[0]!.id).toBe(firstId);
    expect(afterUp[1]!.id).toBe(secondId);
  });

  it('does not move first slide up', () => {
    createOutlineFromPrompt('test');
    const slides = getState().outline!.slides;
    const firstId = slides[0]!.id;

    reorderSlide(firstId, 'up');
    expect(getState().outline!.slides[0]!.id).toBe(firstId);
  });

  it('does not move last slide down', () => {
    createOutlineFromPrompt('test');
    const slides = getState().outline!.slides;
    const lastId = slides[slides.length - 1]!.id;

    reorderSlide(lastId, 'down');
    expect(getState().outline!.slides[slides.length - 1]!.id).toBe(lastId);
  });

  it('edits slide title', () => {
    createOutlineFromPrompt('test');
    const slides = getState().outline!.slides;
    const firstId = slides[0]!.id;

    editSlideTitle(firstId, 'New Title');
    expect(getState().outline!.slides.find((s) => s.id === firstId)!.intent).toBe('New Title');
  });

  it('deletes a slide', () => {
    createOutlineFromPrompt('test');
    const countBefore = getState().outline!.slides.length;
    const firstId = getState().outline!.slides[0]!.id;

    deleteSlide(firstId);
    expect(getState().outline!.slides.length).toBe(countBefore - 1);
    expect(getState().outline!.slides.find((s) => s.id === firstId)).toBeUndefined();
  });

  it('deletes all slides results in null outline', () => {
    createOutlineFromPrompt('test');
    const ids = getState().outline!.slides.map((s) => s.id);
    for (const id of ids) {
      deleteSlide(id);
    }
    expect(getState().outline).toBeNull();
  });

  it('sets chart type on a slide with dataBinding', () => {
    createOutlineFromPrompt('test');
    const withBinding = getState().outline!.slides.find((s) => s.dataBinding !== null);
    expect(withBinding).toBeDefined();

    setChartType(withBinding!.id, 'pie');
    const updated = getState().outline!.slides.find((s) => s.id === withBinding!.id)!;
    expect(updated.chartType).toBe('pie');

    setChartType(withBinding!.id, null);
    expect(getState().outline!.slides.find((s) => s.id === withBinding!.id)!.chartType).toBeNull();
  });

  it('subscribe fires on state changes', () => {
    const listener = vi.fn();
    const unsub = subscribe(listener);
    createOutlineFromPrompt('test');
    expect(listener).toHaveBeenCalledTimes(1);

    editSlideTitle(getState().outline!.slides[0]!.id, 'Changed');
    expect(listener).toHaveBeenCalledTimes(2);

    unsub();
    editSlideTitle(getState().outline!.slides[0]!.id, 'Again');
    expect(listener).toHaveBeenCalledTimes(2); // no more calls
  });

  it('approveAndGenerate transitions through queued → running → succeeded', async () => {
    vi.useFakeTimers();
    createOutlineFromPrompt('test');

    approveAndGenerate();
    expect(getState().jobStatus).toBe('queued');

    // Advance past the queued→running timer
    vi.advanceTimersByTime(500);
    expect(getState().jobStatus).toBe('running');

    // Advance past all per-slide timers (longest is 200 + 7*300 = 2300ms)
    vi.advanceTimersByTime(2500);
    expect(getState().jobStatus).toBe('succeeded');
    expect(getState().completedCount).toBe(getState().generatedSlides.length);
    expect(getState().generatedSlides.every((gs) => gs.status === 'done')).toBe(true);

    vi.useRealTimers();
  });

  it('approveAndGenerate is a no-op when no outline exists', () => {
    approveAndGenerate();
    expect(getState().jobStatus).toBe('idle');
  });

  it('approveAndGenerate is a no-op when already running', () => {
    vi.useFakeTimers();
    createOutlineFromPrompt('test');
    approveAndGenerate();
    expect(getState().jobStatus).toBe('queued');

    // Second call should be ignored
    approveAndGenerate();
    expect(getState().jobStatus).toBe('queued');

    vi.useRealTimers();
  });

  it('resetStore clears everything', () => {
    createOutlineFromPrompt('test');
    approveAndGenerate();
    resetStore();
    expect(getState().outline).toBeNull();
    expect(getState().jobStatus).toBe('idle');
    expect(getState().generatedSlides).toEqual([]);
    expect(getState().completedCount).toBe(0);
  });

  it('reorderSlide is a no-op when no outline', () => {
    reorderSlide('any-id', 'up');
    expect(getState().outline).toBeNull();
  });

  it('editSlideTitle is a no-op when no outline', () => {
    editSlideTitle('any-id', 'New Title');
    expect(getState().outline).toBeNull();
  });

  it('deleteSlide is a no-op when no outline', () => {
    deleteSlide('any-id');
    expect(getState().outline).toBeNull();
  });

  it('setChartType is a no-op when no outline', () => {
    setChartType('any-id', 'bar');
    expect(getState().outline).toBeNull();
  });
});
