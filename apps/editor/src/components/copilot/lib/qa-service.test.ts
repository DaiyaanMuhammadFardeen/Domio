/**
 * qa-service tests — Wave 6 §S6.8.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  generateAudienceVersion,
  generateQA,
  generateSummary,
  personaLabel,
  type DeckContext,
} from './qa-service';

const DECK: DeckContext = {
  deck_id: 'deck-1',
  title: 'Sample',
  slides: [
    { slide_id: 's1', title: 'Intro', body: 'Hello world.' },
    { slide_id: 's2', title: 'Body', body: 'Detail here.' },
  ],
};

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('qa-service', () => {
  it('generateQA returns the remote response when reachable', async () => {
    const remote = { pairs: [], offline: false };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => remote,
    }) as unknown as typeof fetch;
    const out = await generateQA({ deck: DECK });
    expect(out).toEqual(remote);
  });

  it('generateQA falls back to heuristic Q&A offline', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    const out = await generateQA({ deck: DECK, max_pairs: 1 });
    expect(out.offline).toBe(true);
    expect(out.pairs.length).toBe(1);
  });

  it('generateSummary returns the remote response when reachable', async () => {
    const remote = {
      tldr: 'TL;DR — sample',
      summary_slide: { after_slide_id: 's2', title: 'Summary', body: 'TL;DR — sample' },
      offline: false,
    };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => remote,
    }) as unknown as typeof fetch;
    const out = await generateSummary({ deck: DECK });
    expect(out).toEqual(remote);
  });

  it('generateSummary falls back offline', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    const out = await generateSummary({ deck: DECK });
    expect(out.offline).toBe(true);
    expect(out.tldr).toMatch(/TL;DR/);
    expect(out.summary_slide.title).toBeTruthy();
  });

  it('generateAudienceVersion returns the remote response when reachable', async () => {
    const remote = {
      id: 'ver-1',
      persona: 'executive' as const,
      label: 'Executive overview',
      slides: [],
      offline: false,
    };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => remote,
    }) as unknown as typeof fetch;
    const out = await generateAudienceVersion({ deck: DECK, persona: 'executive' });
    expect(out).toEqual(remote);
  });

  it('generateAudienceVersion produces an offline branched deck per persona', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    const five = await generateAudienceVersion({ deck: DECK, persona: 'five_min' });
    expect(five.offline).toBe(true);
    expect(five.label).toBe(personaLabel('five_min'));
    expect(five.slides.length).toBeGreaterThan(0);

    const tech = await generateAudienceVersion({ deck: DECK, persona: 'technical' });
    expect(tech.slides.length).toBe(DECK.slides.length);
    expect(tech.slides[0]?.slide_id).toMatch(/-tech$/);

    const exec = await generateAudienceVersion({ deck: DECK, persona: 'executive' });
    expect(exec.slides[0]?.slide_id).toMatch(/-exec$/);
  });
});
