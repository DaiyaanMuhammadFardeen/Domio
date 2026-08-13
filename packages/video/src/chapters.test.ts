import { describe, it, expect } from 'vitest';
import { createChapterList, getChapterAt } from './chapters.js';

describe('createChapterList', () => {
  it('sorts chapters by start time', () => {
    const list = createChapterList([
      { title: 'C', startMs: 3000 },
      { title: 'A', startMs: 1000 },
      { title: 'B', startMs: 2000 },
    ]);
    expect(list.chapters.map((c) => c.title)).toEqual(['A', 'B', 'C']);
    expect(list.chapters.map((c) => c.startMs)).toEqual([1000, 2000, 3000]);
  });

  it('returns empty list for empty input', () => {
    const list = createChapterList([]);
    expect(list.chapters).toHaveLength(0);
  });

  it('handles single chapter', () => {
    const list = createChapterList([{ title: 'Only', startMs: 0 }]);
    expect(list.chapters).toHaveLength(1);
  });
});

describe('getChapterAt', () => {
  const chapters = [
    { title: 'Intro', startMs: 0 },
    { title: 'Chapter 1', startMs: 5000 },
    { title: 'Chapter 2', startMs: 15000 },
    { title: 'Outro', startMs: 25000 },
  ];

  it('returns undefined for empty chapter list', () => {
    const list = createChapterList([]);
    expect(getChapterAt(list, 0)).toBeUndefined();
  });

  it('returns first chapter at time 0', () => {
    const list = createChapterList(chapters);
    const ch = getChapterAt(list, 0);
    expect(ch).toEqual({ title: 'Intro', startMs: 0 });
  });

  it('returns first chapter before second chapter starts', () => {
    const list = createChapterList(chapters);
    const ch = getChapterAt(list, 4999);
    expect(ch).toEqual({ title: 'Intro', startMs: 0 });
  });

  it('returns second chapter at exact boundary (start inclusive)', () => {
    const list = createChapterList(chapters);
    const ch = getChapterAt(list, 5000);
    expect(ch).toEqual({ title: 'Chapter 1', startMs: 5000 });
  });

  it('returns second chapter just after boundary', () => {
    const list = createChapterList(chapters);
    const ch = getChapterAt(list, 5001);
    expect(ch).toEqual({ title: 'Chapter 1', startMs: 5000 });
  });

  it('returns second chapter before third chapter (exclusive end)', () => {
    const list = createChapterList(chapters);
    const ch = getChapterAt(list, 14999);
    expect(ch).toEqual({ title: 'Chapter 1', startMs: 5000 });
  });

  it('returns third chapter at exact boundary', () => {
    const list = createChapterList(chapters);
    const ch = getChapterAt(list, 15000);
    expect(ch).toEqual({ title: 'Chapter 2', startMs: 15000 });
  });

  it('returns last chapter at exact boundary', () => {
    const list = createChapterList(chapters);
    const ch = getChapterAt(list, 25000);
    expect(ch).toEqual({ title: 'Outro', startMs: 25000 });
  });

  it('returns last chapter after all boundaries', () => {
    const list = createChapterList(chapters);
    const ch = getChapterAt(list, 50000);
    expect(ch).toEqual({ title: 'Outro', startMs: 25000 });
  });

  it('returns undefined for time before first chapter', () => {
    const list = createChapterList([{ title: 'Start', startMs: 5000 }]);
    const ch = getChapterAt(list, 0);
    // Chapter starts at 5000, time 0 is before it → undefined
    expect(ch).toBeUndefined();
  });

  it('handles chapters with same start time (returns last matching)', () => {
    const list = createChapterList([
      { title: 'A', startMs: 5000 },
      { title: 'B', startMs: 5000 },
    ]);
    const ch = getChapterAt(list, 5000);
    expect(ch).toEqual({ title: 'B', startMs: 5000 });
  });
});
