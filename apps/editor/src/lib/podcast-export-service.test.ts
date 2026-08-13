/**
 * podcast-export-service — tests.
 *
 * Per Wave 11 §S11.12 acceptance: services ship with at least one test
 * that asserts the public shape and pipeline behavior.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateScript,
  getDraft,
  getRenderStatus,
  saveDraft,
  startRender,
  __resetPodcastExportForTests,
  type PodcastDraft,
  type ScriptSegment,
} from './podcast-export-service.js';

const DECK = 'demo-deck';

beforeEach(() => {
  __resetPodcastExportForTests();
});

describe('podcast-export-service', () => {
  it('returns null when no draft has been generated', async () => {
    const draft = await getDraft(DECK);
    expect(draft).toBeNull();
  });

  it('generateScript returns a fresh draft with 6–8 segments alternating Host/Guest', async () => {
    const draft = await generateScript(DECK);
    expect(draft.deck_id).toBe(DECK);
    expect(draft.segments.length).toBeGreaterThanOrEqual(6);
    expect(draft.segments.length).toBeLessThanOrEqual(8);
    const voices = new Set(draft.segments.map((s) => s.voice));
    expect(voices.has('host')).toBe(true);
    expect(voices.has('guest')).toBe(true);
    // ordering is monotonic
    draft.segments.forEach((seg, idx) => {
      expect(seg.order).toBe(idx);
      expect(seg.id.length).toBeGreaterThan(0);
      expect(seg.text.length).toBeGreaterThan(0);
    });
    // at least one segment references a slide
    expect(draft.segments.some((s) => typeof s.slide_id === 'string')).toBe(true);
  });

  it('saveDraft then getDraft returns the same draft', async () => {
    const draft = await generateScript(DECK);
    const mutated: PodcastDraft = {
      ...draft,
      title: 'Updated title',
      segments: draft.segments.map((s, idx) =>
        idx === 0 ? { ...s, text: 'Custom intro' } : s,
      ),
    };
    const saved = await saveDraft(mutated);
    expect(saved.title).toBe('Updated title');
    expect(saved.updated_at_ms).toBeGreaterThanOrEqual(draft.updated_at_ms);
    const fetched = await getDraft(DECK);
    expect(fetched).not.toBeNull();
    expect(fetched?.title).toBe('Updated title');
    expect(fetched?.segments[0]?.text).toBe('Custom intro');
  });

  it('startRender returns a pending render with progress 0', async () => {
    const draft = await generateScript(DECK);
    const render = await startRender(draft.id);
    expect(render.status).toBe('pending');
    expect(render.progress).toBe(0);
    expect(render.draft_id).toBe(draft.id);
    expect(typeof render.started_at_ms).toBe('number');
  });

  it('getRenderStatus advances pending → generating → rendering → complete over 3 polls', async () => {
    const draft = await generateScript(DECK);
    const render = await startRender(draft.id);

    const poll1 = await getRenderStatus(render.id);
    expect(poll1.status).toBe('generating');
    expect(poll1.progress).toBe(25);

    const poll2 = await getRenderStatus(render.id);
    expect(poll2.status).toBe('rendering');
    expect(poll2.progress).toBe(70);

    const poll3 = await getRenderStatus(render.id);
    expect(poll3.status).toBe('complete');
    expect(poll3.progress).toBe(100);
    expect(typeof poll3.audio_url).toBe('string');
    expect(poll3.audio_url?.endsWith('.mp3')).toBe(true);
    expect(typeof poll3.duration_sec).toBe('number');
    expect(typeof poll3.completed_at_ms).toBe('number');
  });

  it('getRenderStatus throws for an unknown render id', async () => {
    await expect(getRenderStatus('nope')).rejects.toThrow(/Unknown render id/);
  });

  it('does not mutate caller-owned segment arrays on save', async () => {
    const draft = await generateScript(DECK);
    const original: ScriptSegment[] = draft.segments;
    const saved = await saveDraft(draft);
    saved.segments[0]!.text = 'CHANGED';
    expect(original[0]!.text).not.toBe('CHANGED');
  });
});