import { describe, it, expect } from 'vitest';
import {
  createDraft,
  draftReducer,
  appendChunk,
  resumeDraft,
  finalizeDraft,
  recoverDraft,
  InvalidTransitionError,
} from './drafts.js';
import type { RecordingChunk } from './drafts.js';

function makeChunk(ts: number): RecordingChunk {
  return { blob: new Blob(['x']), timestamp: ts };
}

describe('createDraft', () => {
  it('starts in idle state with no chunks', () => {
    const draft = createDraft();
    expect(draft.state).toBe('idle');
    expect(draft.chunks).toHaveLength(0);
    expect(draft.startedAt).toBeNull();
  });
});

describe('draftReducer state transitions', () => {
  it('transitions idle → recording', () => {
    const draft = createDraft();
    const next = draftReducer(draft, { type: 'start' }, 1000);
    expect(next.state).toBe('recording');
    expect(next.startedAt).toBe(1000);
  });

  it('transitions recording → paused', () => {
    const draft = createDraft();
    const recording = draftReducer(draft, { type: 'start' }, 1000);
    const paused = draftReducer(recording, { type: 'pause' }, 2000);
    expect(paused.state).toBe('paused');
  });

  it('transitions paused → recording (resume)', () => {
    const draft = createDraft();
    const recording = draftReducer(draft, { type: 'start' }, 1000);
    const paused = draftReducer(recording, { type: 'pause' }, 2000);
    const resumed = draftReducer(paused, { type: 'resume' }, 3000);
    expect(resumed.state).toBe('recording');
  });

  it('transitions recording → finalized', () => {
    const draft = createDraft();
    const recording = draftReducer(draft, { type: 'start' }, 1000);
    const finalized = draftReducer(recording, { type: 'finalize' }, 5000);
    expect(finalized.state).toBe('finalized');
  });

  it('transitions paused → finalized', () => {
    const draft = createDraft();
    const recording = draftReducer(draft, { type: 'start' }, 1000);
    const paused = draftReducer(recording, { type: 'pause' }, 2000);
    const finalized = draftReducer(paused, { type: 'finalize' }, 5000);
    expect(finalized.state).toBe('finalized');
  });
});

describe('draftReducer invalid transitions', () => {
  it('rejects idle → pause', () => {
    const draft = createDraft();
    expect(() => draftReducer(draft, { type: 'pause' }, 1000)).toThrow(InvalidTransitionError);
  });

  it('rejects idle → finalize', () => {
    const draft = createDraft();
    expect(() => draftReducer(draft, { type: 'finalize' }, 1000)).toThrow(InvalidTransitionError);
  });

  it('rejects finalized → recording', () => {
    const draft = createDraft();
    const recording = draftReducer(draft, { type: 'start' }, 1000);
    const finalized = draftReducer(recording, { type: 'finalize' }, 5000);
    expect(() => draftReducer(finalized, { type: 'start' }, 6000)).toThrow(InvalidTransitionError);
  });

  it('rejects recording → recording (double start)', () => {
    const draft = createDraft();
    const recording = draftReducer(draft, { type: 'start' }, 1000);
    expect(() => draftReducer(recording, { type: 'start' }, 2000)).toThrow(InvalidTransitionError);
  });

  it('rejects paused → paused (double pause)', () => {
    const draft = createDraft();
    const recording = draftReducer(draft, { type: 'start' }, 1000);
    const paused = draftReducer(recording, { type: 'pause' }, 2000);
    expect(() => draftReducer(paused, { type: 'pause' }, 3000)).toThrow(InvalidTransitionError);
  });
});

describe('appendChunk', () => {
  it('appends a chunk in recording state', () => {
    const draft = createDraft();
    const recording = draftReducer(draft, { type: 'start' }, 1000);
    const chunk = makeChunk(1500);
    const updated = appendChunk(recording, chunk);
    expect(updated.chunks).toHaveLength(1);
    expect(updated.chunks[0]).toBe(chunk);
  });

  it('rejects appending in idle state', () => {
    const draft = createDraft();
    expect(() => appendChunk(draft, makeChunk(1000))).toThrow(InvalidTransitionError);
  });

  it('rejects appending in paused state', () => {
    const draft = createDraft();
    const recording = draftReducer(draft, { type: 'start' }, 1000);
    const paused = draftReducer(recording, { type: 'pause' }, 2000);
    expect(() => appendChunk(paused, makeChunk(2500))).toThrow(InvalidTransitionError);
  });

  it('collects multiple chunks', () => {
    const draft = createDraft();
    const recording = draftReducer(draft, { type: 'start' }, 1000);
    let current = appendChunk(recording, makeChunk(1100));
    current = appendChunk(current, makeChunk(1200));
    current = appendChunk(current, makeChunk(1300));
    expect(current.chunks).toHaveLength(3);
  });
});

describe('resumeDraft', () => {
  it('transitions from paused to recording', () => {
    const draft = createDraft();
    const recording = draftReducer(draft, { type: 'start' }, 1000);
    const paused = draftReducer(recording, { type: 'pause' }, 2000);
    const resumed = resumeDraft(paused, 3000);
    expect(resumed.state).toBe('recording');
  });
});

describe('finalizeDraft', () => {
  it('returns chunks and duration', () => {
    const draft = createDraft();
    const recording = draftReducer(draft, { type: 'start' }, 1000);
    const withChunks = appendChunk(
      appendChunk(appendChunk(recording, makeChunk(1100)), makeChunk(1500)),
      makeChunk(5000),
    );
    const result = finalizeDraft(withChunks, 5000);
    expect(result.chunks).toHaveLength(3);
    expect(result.durationMs).toBe(4000); // 5000 - 1000
  });

  it('returns 0 duration when no chunks', () => {
    const draft = createDraft();
    const recording = draftReducer(draft, { type: 'start' }, 1000);
    const result = finalizeDraft(recording, 5000);
    expect(result.durationMs).toBe(0);
  });
});

describe('recoverDraft', () => {
  it('reconstructs duration from chunk timestamps', () => {
    const chunks: RecordingChunk[] = [makeChunk(1000), makeChunk(2000), makeChunk(5000)];
    const result = recoverDraft(chunks);
    expect(result.durationMs).toBe(4000); // 5000 - 1000
    expect(result.chunks).toHaveLength(3);
  });

  it('returns 0 duration for empty chunks', () => {
    const result = recoverDraft([]);
    expect(result.durationMs).toBe(0);
  });

  it('returns 0 duration for single chunk', () => {
    const result = recoverDraft([makeChunk(1000)]);
    expect(result.durationMs).toBe(0);
  });
});
