import { describe, expect, it } from 'vitest';
import { HeuristicMlModerator } from '@domio/moderation-ml';
import { ModerationFlagger, InMemoryFlaggerStore } from './index.js';

describe('moderation-flagger', () => {
  it('reruns ML and persists decision', async () => {
    const store = new InMemoryFlaggerStore();
    const f = new ModerationFlagger(new HeuristicMlModerator(), store);
    const d = await f.process({
      workspace_id: 'w1',
      session_id: 's1',
      subject_kind: 'qa_submit',
      subject_id: 'q-1',
      raw_text: 'you idiot loser',
    });
    expect(d.decision).toBe('block');
    expect(d.source).toBe('ml');
    const list = await store.list({ workspace_id: 'w1', session_id: 's1' });
    expect(list).toHaveLength(1);
  });

  it('passes clean text through', async () => {
    const store = new InMemoryFlaggerStore();
    const f = new ModerationFlagger(new HeuristicMlModerator(), store);
    const d = await f.process({
      workspace_id: 'w1',
      session_id: 's1',
      subject_kind: 'word_cloud_submit',
      subject_id: 'w-1',
      raw_text: 'wonderful',
    });
    expect(d.decision).toBe('allow');
  });
});
