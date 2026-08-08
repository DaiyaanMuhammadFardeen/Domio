import { describe, it, expect } from 'vitest';
import { MemoryDailyCap, NoopDailyCap, keyFor } from './daily.js';

describe('caps/daily (memory)', () => {
  it('allows up to cap then rejects', async () => {
    const cap = new MemoryDailyCap();
    const day = Date.UTC(2026, 0, 15);
    for (let i = 0; i < 5; i++) {
      expect(await cap.allowAndIncr('u-1', 5, day)).toBe(true);
    }
    expect(await cap.allowAndIncr('u-1', 5, day)).toBe(false);
    expect(await cap.count('u-1', day)).toBe(5);
  });

  it('different recipients have independent counters', async () => {
    const cap = new MemoryDailyCap();
    const day = Date.UTC(2026, 0, 15);
    for (let i = 0; i < 3; i++) {
      expect(await cap.allowAndIncr('a', 3, day)).toBe(true);
    }
    expect(await cap.allowAndIncr('a', 3, day)).toBe(false);
    // b is fresh
    expect(await cap.allowAndIncr('b', 3, day)).toBe(true);
  });

  it('different days have independent counters', async () => {
    const cap = new MemoryDailyCap();
    const d1 = Date.UTC(2026, 0, 15);
    const d2 = Date.UTC(2026, 0, 16);
    for (let i = 0; i < 3; i++) {
      expect(await cap.allowAndIncr('u-1', 3, d1)).toBe(true);
    }
    expect(await cap.allowAndIncr('u-1', 3, d1)).toBe(false);
    // d2 is fresh
    expect(await cap.allowAndIncr('u-1', 3, d2)).toBe(true);
  });

  it('reset clears the counter', async () => {
    const cap = new MemoryDailyCap();
    const day = Date.UTC(2026, 0, 15);
    await cap.allowAndIncr('u-1', 3, day);
    await cap.allowAndIncr('u-1', 3, day);
    await cap.reset('u-1', day);
    expect(await cap.count('u-1', day)).toBe(0);
    expect(await cap.allowAndIncr('u-1', 3, day)).toBe(true);
  });

  it('NoopDailyCap never caps', async () => {
    const cap = new NoopDailyCap();
    for (let i = 0; i < 100; i++) {
      expect(await cap.allowAndIncr('u-1', 5)).toBe(true);
    }
  });

  it('keyFor uses UTC date components', () => {
    const t = Date.UTC(2026, 11, 31, 23, 59, 59);
    expect(keyFor('u', t)).toBe('notif:daily:u:2026-12-31');
    const t2 = Date.UTC(2026, 0, 1, 0, 0, 1);
    expect(keyFor('u', t2)).toBe('notif:daily:u:2026-01-01');
  });
});
