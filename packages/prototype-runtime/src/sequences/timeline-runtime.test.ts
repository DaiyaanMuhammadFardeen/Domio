import { describe, expect, it, vi } from 'vitest';
import { TimelineRuntime, DEFAULT_PAUSE_WARN_AT_MS } from './timeline-runtime.js';
import {
  applyInterruption,
  dequeueInterruption,
  initialInterruptionState,
} from './interruption-policy.js';
import { VisibilityListener } from './visibility-listener.js';
import type { PresentationSequence } from '../types.js';
import type { VisibilityLike } from './visibility-listener.js';

const TENANT = 'tenant-1';
const DECK = 'deck-1';

function makeSeq(partial: Partial<PresentationSequence> = {}): PresentationSequence {
  return {
    id: 'seq-1',
    tenantId: TENANT,
    deckId: DECK,
    name: 'Onboarding',
    slides: ['s1', 's2', 's3'],
    intervalMs: 1_000,
    pauseOnEvent: false,
    loop: false,
    count: 1,
    interruptionPolicy: 'queue',
    reducedMotionDefaultOff: false,
    pauseWarnAtMs: DEFAULT_PAUSE_WARN_AT_MS,
    version: 0,
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  };
}

describe('TimelineRuntime — start/pause/resume', () => {
  it('starts a sequence and advances slides over interval ticks', () => {
    const seq = makeSeq({ intervalMs: 1000 });
    const r = new TimelineRuntime({ reducedMotion: () => false });
    expect(r.start(seq)).toBe(true);
    expect(r.currentSlide()).toBe('s1');
    r.tick(1100);
    expect(r.currentSlide()).toBe('s2');
    r.tick(1100);
    expect(r.currentSlide()).toBe('s3');
  });

  it('pause/resume accumulates paused_total_ms and resumes on the same slide', () => {
    let clock = 1_000;
    const r = new TimelineRuntime({ reducedMotion: () => false, clock: () => clock });
    r.start(makeSeq());
    r.tick(500); // halfway through the first slide
    expect(r.currentSlide()).toBe('s1');
    r.pause();
    expect(r.isPlaying()).toBe(false);
    clock += 5_000;
    const resumed = r.resume();
    expect(resumed).toBe('s1');
    expect(r.pausedTotalMs()).toBe(5_000);
  });

  it('does not advance while paused', () => {
    const r = new TimelineRuntime({ reducedMotion: () => false });
    r.start(makeSeq({ intervalMs: 1000 }));
    r.tick(500);
    r.pause();
    r.tick(2000); // tick ignored while paused
    expect(r.currentSlide()).toBe('s1');
    expect(r.pausedTotalMs()).toBe(0);
  });

  it('pause control is always visible (resume() is idempotent)', () => {
    const r = new TimelineRuntime();
    r.start(makeSeq());
    r.pause();
    const first = r.resume();
    const second = r.resume();
    expect(first).toBe('s1');
    expect(second).toBe(null);
  });
});

describe('TimelineRuntime — interruption policies', () => {
  it('ignore drops interruptions but does not abort', () => {
    const r = new TimelineRuntime();
    r.start(makeSeq({ interruptionPolicy: 'ignore' }));
    r.interrupt({ kind: 'click', slideId: 's1' });
    expect(r.isAborted()).toBe(false);
    expect(r.queuedInterruptions().length).toBe(0);
  });

  it('queue buffers interruptions in FIFO order', () => {
    const r = new TimelineRuntime();
    r.start(makeSeq({ interruptionPolicy: 'queue' }));
    r.interrupt({ kind: 'click', slideId: 's1' });
    r.interrupt({ kind: 'tap', slideId: 's1' });
    const q = r.queuedInterruptions();
    expect(q.length).toBe(2);
    expect(q[0]!.kind).toBe('click');
    expect(q[1]!.kind).toBe('tap');
  });

  it('abort halts the sequence on first interruption', () => {
    const r = new TimelineRuntime();
    r.start(makeSeq({ interruptionPolicy: 'abort' }));
    r.interrupt({ kind: 'click', slideId: 's1' });
    expect(r.isAborted()).toBe(true);
    r.tick(10_000);
    expect(r.currentSlide()).toBe('s1');
  });
});

describe('TimelineRuntime — reduced motion default-off', () => {
  it('does not start when prefers-reduced-motion: reduce is set AND reducedMotionDefaultOff is true', () => {
    const r = new TimelineRuntime({ reducedMotion: () => true });
    const started = r.start(makeSeq({ reducedMotionDefaultOff: true }));
    expect(started).toBe(false);
    expect(r.isPlaying()).toBe(false);
  });

  it('still starts when reducedMotionDefaultOff is false', () => {
    const r = new TimelineRuntime({ reducedMotion: () => true });
    const started = r.start(makeSeq({ reducedMotionDefaultOff: false }));
    expect(started).toBe(true);
  });

  it('stops an active sequence when reduced-motion flips on at runtime', () => {
    const r = new TimelineRuntime({ reducedMotion: () => false });
    r.start(makeSeq({ reducedMotionDefaultOff: true }));
    r.applyReducedMotion(true);
    expect(r.isPlaying()).toBe(false);
  });
});

describe('TimelineRuntime — pause warning', () => {
  it('fires onWarn at pauseWarnAtMs the first time only', () => {
    const onWarn = vi.fn();
    const r = new TimelineRuntime({ onWarn });
    r.start(makeSeq({ pauseWarnAtMs: 60_000 }));
    expect(r.flagPauseProgress(30_000)).toBe(false);
    expect(r.flagPauseProgress(70_000)).toBe(true);
    expect(onWarn).toHaveBeenCalledTimes(1);
    expect(r.flagPauseProgress(75_000)).toBe(false);
  });
});

describe('TimelineRuntime — loop + count', () => {
  it('loops when loop = true', () => {
    const r = new TimelineRuntime();
    r.start(makeSeq({ loop: true, intervalMs: 1_000 }));
    r.tick(2_500); // 2 advances: s1 → s2 → s3.
    expect(r.currentSlide()).toBe('s3');
    expect(r.completedPlays()).toBe(0);
    r.tick(2_000); // 2 more advances
    // Iter 1 (idx 2→0 with completedPlays=1 due to loop),
    // Iter 2 (idx 0→1 = s2). 1000ms left, exit.
    expect(r.currentSlide()).toBe('s2');
    expect(r.completedPlays()).toBe(1);
  });

  it('honors count when count > 1', () => {
    const r = new TimelineRuntime();
    r.start(makeSeq({ loop: false, count: 2, intervalMs: 1000 }));
    r.tick(7_000); // 7 slide intervals, 3 slides → 2 complete plays
    expect(r.completedPlays()).toBe(2);
    expect(r.isPlaying()).toBe(false);
  });

  it('rejects empty slides', () => {
    const r = new TimelineRuntime();
    expect(r.start(makeSeq({ slides: [] }))).toBe(false);
  });
});

describe('Interruption policy — pure functions', () => {
  it('applyInterruption ignores for the ignore policy', () => {
    const state = initialInterruptionState('ignore');
    const after = applyInterruption(state, { kind: 'click', slideId: 's', at: 1 });
    expect(after.queue).toHaveLength(0);
    expect(after.ignoredCount).toBe(1);
  });

  it('dequeue returns null on empty queue', () => {
    const state = initialInterruptionState('queue');
    const { state: s2, next } = dequeueInterruption(state);
    expect(next).toBeNull();
    expect(s2.queue).toHaveLength(0);
  });

  it('dequeue returns and removes the head', () => {
    let state = initialInterruptionState('queue');
    state = applyInterruption(state, { kind: 'click', slideId: 's', at: 1 });
    state = applyInterruption(state, { kind: 'tap', slideId: 's', at: 2 });
    const { state: nextState, next } = dequeueInterruption(state);
    expect(next?.kind).toBe('click');
    expect(nextState.queue).toHaveLength(1);
    expect(nextState.processedCount).toBe(1);
  });
});

class FakeVisibility implements VisibilityLike {
  private listeners = new Set<() => void>();
  public hiddenVal = false;
  constructor(public initial = false) {
    this.hiddenVal = initial;
  }
  get hidden() { return this.hiddenVal; }
  setHidden(v: boolean) {
    this.hiddenVal = v;
    for (const l of this.listeners) l();
  }
  addEventListener(t: 'visibilitychange', l: () => void) {
    if (t === 'visibilitychange') this.listeners.add(l);
  }
  removeEventListener(t: 'visibilitychange', l: () => void) {
    if (t === 'visibilitychange') this.listeners.delete(l);
  }
}

describe('VisibilityListener', () => {
  it('pauses on visibility hidden and resumes on visible', () => {
    const doc = new FakeVisibility(false);
    const states: string[] = [];
    let clock = 1_000;
    const r = new TimelineRuntime({
      clock: () => clock,
      reducedMotion: () => false,
    });
    r.start(makeSeq());
    const l = new VisibilityListener({
      document: doc,
      clock: () => clock,
      onChange: (visible) => {
        states.push(visible ? 'visible' : 'hidden');
        if (visible) r.resume(); else r.pause();
      },
    });
    l.attach();
    // Initial visible → no change.
    doc.setHidden(true);
    expect(r.isPlaying()).toBe(false);
    expect(r.pausedTotalMs()).toBe(0);
    clock += 3_000;
    doc.setHidden(false);
    expect(r.isPlaying()).toBe(true);
    // After resume, pausedTotalMs should be ~3s.
    expect(r.pausedTotalMs()).toBeGreaterThanOrEqual(3_000);
    l.detach();
  });

  it('handles tab-backgrounded clock — does not advance while hidden', () => {
    const doc = new FakeVisibility(false);
    let clock = 1_000;
    const r = new TimelineRuntime({
      clock: () => clock,
      reducedMotion: () => false,
    });
    r.start(makeSeq({ intervalMs: 1_000 }));
    const l = new VisibilityListener({
      document: doc,
      clock: () => clock,
      onChange: (visible) => {
        if (visible) r.resume(); else r.pause();
      },
    });
    l.attach();
    r.tick(500);
    doc.setHidden(true);
    clock += 5_000; // simulate 5 seconds hidden
    r.tick(5_000); // tick while paused — should not advance slide
    expect(r.currentSlide()).toBe('s1');
    doc.setHidden(false);
    expect(r.pausedTotalMs()).toBeGreaterThanOrEqual(5_000);
    l.detach();
  });
});