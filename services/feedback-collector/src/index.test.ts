import { describe, expect, it } from 'vitest';
import { InMemoryFeedbackStore } from './index.js';

describe('feedback-collector', () => {
  it('accepts NPS + stars + free text', async () => {
    const s = new InMemoryFeedbackStore();
    const r = await s.submit({
      workspace_id: 'w1', session_id: 's1', participant_id: 'u-1',
      nps_score: 10, stars: [{ slide_id: 'sl-1', score: 5 }], free_text: 'great',
    });
    expect(r.nps_score).toBe(10);
    expect(r.stars).toHaveLength(1);
  });

  it('rejects duplicate submissions per participant', async () => {
    const s = new InMemoryFeedbackStore();
    await s.submit({ workspace_id: 'w1', session_id: 's1', participant_id: 'u-1', nps_score: 10, stars: [], free_text: null });
    await expect(
      s.submit({ workspace_id: 'w1', session_id: 's1', participant_id: 'u-1', nps_score: 5, stars: [], free_text: null }),
    ).rejects.toThrow(/already submitted/);
  });

  it('aggregates NPS buckets and star average', async () => {
    const s = new InMemoryFeedbackStore();
    await s.submit({ workspace_id: 'w1', session_id: 's1', participant_id: 'u-1', nps_score: 10, stars: [{ slide_id: 'a', score: 5 }], free_text: 'great' });
    await s.submit({ workspace_id: 'w1', session_id: 's1', participant_id: 'u-2', nps_score: 8, stars: [{ slide_id: 'a', score: 4 }], free_text: null });
    await s.submit({ workspace_id: 'w1', session_id: 's1', participant_id: 'u-3', nps_score: 3, stars: [{ slide_id: 'a', score: 1 }], free_text: 'meh' });
    const a = await s.aggregate({ workspace_id: 'w1', session_id: 's1' });
    expect(a.nps_promoters).toBe(1);
    expect(a.nps_passives).toBe(1);
    expect(a.nps_detractors).toBe(1);
    expect(a.star_average).toBeCloseTo(10 / 3, 2);
    expect(a.free_text_count).toBe(2);
  });
});
